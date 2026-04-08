import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { config } from './config.js';
import { logger } from './logger.js';
import { cache } from './cache.js';
import { ApiError } from '../schema/types.js';

/**
 * Paginated response shape for the Help Scout Docs API.
 * Different from the main API's _embedded / _links / page format.
 */
export interface DocsPaginatedResponse<T> {
  items: T[];
  page: number;
  pages: number;
  count: number;
}

interface RetryConfig {
  retries: number;
  retryDelay: number;
  maxRetryDelay: number;
  retryCondition?: (error: AxiosError) => boolean;
}

interface RequestMetadata {
  requestId: string;
  startTime: number;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: RequestMetadata;
  }
}

export class DocsClient {
  private client: AxiosInstance;
  private httpAgent: HttpAgent;
  private httpsAgent: HttpsAgent;

  private defaultRetryConfig: RetryConfig = {
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000,
    retryCondition: (error: AxiosError) => {
      return !error.response ||
             error.code === 'ECONNABORTED' ||
             (error.response.status >= 500 && error.response.status < 600) ||
             error.response.status === 429;
    },
  };

  private noRetryConfig: RetryConfig = {
    retries: 0,
    retryDelay: 0,
    maxRetryDelay: 0,
  };

  constructor() {
    if (!config.docs) {
      throw new Error('Docs API configuration not available. Set HELPSCOUT_DOCS_API_KEY.');
    }

    const poolConfig = config.connectionPool;

    this.httpAgent = new HttpAgent({
      keepAlive: poolConfig.keepAlive,
      keepAliveMsecs: poolConfig.keepAliveMsecs,
      maxSockets: poolConfig.maxSockets,
      maxFreeSockets: poolConfig.maxFreeSockets,
      timeout: poolConfig.timeout,
    });

    this.httpsAgent = new HttpsAgent({
      keepAlive: poolConfig.keepAlive,
      keepAliveMsecs: poolConfig.keepAliveMsecs,
      maxSockets: poolConfig.maxSockets,
      maxFreeSockets: poolConfig.maxFreeSockets,
      timeout: poolConfig.timeout,
    });

    this.client = axios.create({
      baseURL: config.docs.baseUrl,
      timeout: 30000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      auth: {
        username: config.docs.apiKey,
        password: 'X',
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    this.setupInterceptors();

    logger.info('Docs API HTTP client initialized', {
      baseUrl: config.docs.baseUrl,
    });
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use((reqConfig) => {
      const requestId = Math.random().toString(36).substring(7);
      reqConfig.metadata = { requestId, startTime: Date.now() };

      logger.debug('Docs API request', {
        requestId,
        method: reqConfig.method?.toUpperCase(),
        url: reqConfig.url,
      });

      return reqConfig;
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const duration = response.config.metadata ? Date.now() - response.config.metadata.startTime : 0;
        logger.debug('Docs API response', {
          requestId: response.config.metadata?.requestId || 'unknown',
          status: response.status,
          duration,
        });
        return response;
      },
      (error: AxiosError) => {
        const duration = error.config?.metadata ? Date.now() - error.config.metadata.startTime : 0;
        logger.error('Docs API error', {
          requestId: error.config?.metadata?.requestId || 'unknown',
          status: error.response?.status,
          message: error.message,
          duration,
        });
        return Promise.reject(error);
      },
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateRetryDelay(attempt: number, baseDelay: number, maxDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>,
    retryConfig: RetryConfig = this.defaultRetryConfig,
  ): Promise<AxiosResponse<T>> {
    let lastError: AxiosError | undefined;

    for (let attempt = 0; attempt <= retryConfig.retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as AxiosError;

        if (attempt === retryConfig.retries) break;
        if (!retryConfig.retryCondition?.(lastError)) break;

        if (lastError.response?.status === 429) {
          const retryAfter = parseInt(lastError.response.headers['retry-after'] || '60', 10) * 1000;
          const delay = Math.min(retryAfter, retryConfig.maxRetryDelay);
          logger.warn('Docs API rate limit hit, waiting before retry', {
            attempt: attempt + 1,
            retryAfter: delay,
          });
          await this.sleep(delay);
        } else {
          const delay = this.calculateRetryDelay(attempt, retryConfig.retryDelay, retryConfig.maxRetryDelay);
          logger.warn('Docs API request failed, retrying', {
            attempt: attempt + 1,
            totalAttempts: retryConfig.retries + 1,
            delay,
            error: lastError.message,
            status: lastError.response?.status,
          });
          await this.sleep(delay);
        }
      }
    }

    if (lastError) {
      throw this.transformError(lastError);
    }
    throw new Error('Docs API request failed without error details');
  }

  private transformError(error: AxiosError): ApiError {
    const requestId = error.config?.metadata?.requestId || 'unknown';

    logger.error('Docs API request failed', {
      requestId,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
    });

    if (error.response?.status === 401) {
      return {
        code: 'UNAUTHORIZED',
        message: 'Docs API authentication failed. Check your HELPSCOUT_DOCS_API_KEY.',
        details: { requestId },
      };
    }

    if (error.response?.status === 403) {
      return {
        code: 'UNAUTHORIZED',
        message: 'Docs API access forbidden. Insufficient permissions.',
        details: { requestId },
      };
    }

    if (error.response?.status === 404) {
      return {
        code: 'NOT_FOUND',
        message: 'Docs API resource not found.',
        details: { requestId },
      };
    }

    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
      return {
        code: 'RATE_LIMIT',
        message: `Docs API rate limit exceeded. Wait ${retryAfter} seconds.`,
        retryAfter,
        details: { requestId },
      };
    }

    if (error.response?.status === 422) {
      const responseData = error.response.data as Record<string, any> || {};
      return {
        code: 'INVALID_INPUT',
        message: `Docs API validation error: ${responseData.message || 'Invalid request data'}`,
        details: { requestId, validationErrors: responseData },
      };
    }

    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      const responseData = error.response.data as Record<string, any> || {};
      return {
        code: 'INVALID_INPUT',
        message: `Docs API client error: ${responseData.message || 'Invalid request'}`,
        details: { requestId, statusCode: error.response.status },
      };
    }

    if (error.response?.status && error.response.status >= 500) {
      return {
        code: 'UPSTREAM_ERROR',
        message: `Docs API server error (${error.response.status}).`,
        details: { requestId },
      };
    }

    return {
      code: 'UPSTREAM_ERROR',
      message: `Docs API error: ${error.message || 'Unknown error'}`,
      details: { requestId, errorCode: error.code },
    };
  }

  /**
   * GET a paginated list of resources, unwrapping the response envelope.
   * Docs API returns lists as { "collections": { "items": [...], "page": 1, ... } }, etc.
   */
  async getList<T>(endpoint: string, key: string, params?: Record<string, unknown>, cacheOptions?: { ttl?: number }): Promise<DocsPaginatedResponse<T>> {
    const cacheKey = `DOCS:GET:${endpoint}`;
    const cachedResult = cache.get<DocsPaginatedResponse<T>>(cacheKey, params);
    if (cachedResult) return cachedResult;

    const response = await this.executeWithRetry<Record<string, DocsPaginatedResponse<T>>>(() =>
      this.client.get<Record<string, DocsPaginatedResponse<T>>>(endpoint, { params }),
    );

    const data = response.data[key] || { items: [], page: 0, pages: 0, count: 0 };

    const ttl = cacheOptions?.ttl ?? this.getDefaultCacheTtl(endpoint);
    cache.set(cacheKey, params, data, { ttl });

    return data;
  }

  /**
   * GET a paginated list of resources (raw, no envelope unwrapping).
   */
  async get<T>(endpoint: string, params?: Record<string, unknown>, cacheOptions?: { ttl?: number }): Promise<T> {
    const cacheKey = `DOCS:GET:${endpoint}`;
    const cachedResult = cache.get<T>(cacheKey, params);
    if (cachedResult) return cachedResult;

    const response = await this.executeWithRetry<T>(() =>
      this.client.get<T>(endpoint, { params }),
    );

    const ttl = cacheOptions?.ttl ?? this.getDefaultCacheTtl(endpoint);
    cache.set(cacheKey, params, response.data, { ttl });

    return response.data;
  }

  /**
   * GET a single resource, unwrapping the response envelope.
   * Docs API returns single resources as { "article": {...} }, { "collection": {...} }, etc.
   */
  async getOne<T>(endpoint: string, key: string, params?: Record<string, unknown>, cacheOptions?: { ttl?: number }): Promise<T> {
    const cacheKey = `DOCS:GET:${endpoint}`;
    const cacheData = { key, ...params };
    const cachedResult = cache.get<T>(cacheKey, cacheData);
    if (cachedResult) return cachedResult;

    const response = await this.executeWithRetry<Record<string, T>>(() =>
      this.client.get<Record<string, T>>(endpoint, { params }),
    );

    const data = response.data[key];
    if (!data) {
      throw {
        code: 'NOT_FOUND',
        message: `Docs API: unexpected response shape, missing key "${key}"`,
        details: {},
      } as ApiError;
    }

    const ttl = cacheOptions?.ttl ?? this.getDefaultCacheTtl(endpoint);
    cache.set(cacheKey, cacheData, data, { ttl });

    return data;
  }

  /**
   * POST a new resource. No retries (non-idempotent).
   */
  async post<T = void>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const response = await this.executeWithRetry<T>(
      () => this.client.post<T>(endpoint, data),
      this.noRetryConfig,
    );
    this.invalidateCache(endpoint);
    return response.data;
  }

  /**
   * PUT (full update) an existing resource. Retries enabled (idempotent).
   */
  async put<T = void>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const response = await this.executeWithRetry<T>(
      () => this.client.put<T>(endpoint, data),
    );
    this.invalidateCache(endpoint);
    return response.data;
  }

  /**
   * DELETE a resource. Retries enabled (idempotent).
   */
  async delete(endpoint: string): Promise<void> {
    await this.executeWithRetry<void>(
      () => this.client.delete(endpoint),
    );
    this.invalidateCache(endpoint);
  }

  private invalidateCache(endpoint: string): void {
    logger.debug('Invalidating Docs cache after write', { endpoint });
    cache.clear();
  }

  private getDefaultCacheTtl(endpoint: string): number {
    if (endpoint.includes('/sites')) return 86400;       // 24 hours
    if (endpoint.includes('/collections')) return 3600;  // 1 hour
    if (endpoint.includes('/categories')) return 3600;   // 1 hour
    if (endpoint.includes('/articles')) return 600;      // 10 minutes
    if (endpoint.includes('/search')) return 300;        // 5 minutes
    return 300;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/collections', { page: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async closePool(): Promise<void> {
    logger.info('Closing Docs API HTTP connection pool');
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    await this.sleep(100);
    logger.info('Docs API HTTP connections closed');
  }
}

// Conditionally create client — only when Docs API key is configured
export const docsClient = config.docs ? new DocsClient() : null;
