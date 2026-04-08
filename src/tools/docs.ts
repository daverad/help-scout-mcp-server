import { Tool, CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { docsClient, DocsPaginatedResponse } from '../utils/docs-client.js';
import { createMcpToolError, isApiError } from '../utils/mcp-errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { z } from 'zod';
import {
  DocsArticle,
  DocsArticleRef,
  DocsCollection,
  DocsCategory,
  DocsSite,
  DocsRevision,
  DocsRedirect,
  DocsListSitesInputSchema,
  DocsGetSiteInputSchema,
  DocsListCollectionsInputSchema,
  DocsGetCollectionInputSchema,
  DocsCreateCollectionInputSchema,
  DocsUpdateCollectionInputSchema,
  DocsDeleteCollectionInputSchema,
  DocsListCategoriesInputSchema,
  DocsGetCategoryInputSchema,
  DocsCreateCategoryInputSchema,
  DocsUpdateCategoryInputSchema,
  DocsDeleteCategoryInputSchema,
  DocsListArticlesInputSchema,
  DocsGetArticleInputSchema,
  DocsSearchArticlesInputSchema,
  DocsGetRelatedArticlesInputSchema,
  DocsListArticleRevisionsInputSchema,
  DocsGetArticleRevisionInputSchema,
  DocsCreateArticleInputSchema,
  DocsUpdateArticleInputSchema,
  DocsDeleteArticleInputSchema,
  DocsListRedirectsInputSchema,
  DocsCreateRedirectInputSchema,
  DocsUpdateRedirectInputSchema,
  DocsDeleteRedirectInputSchema,
} from '../schema/docs-types.js';

export class DocsToolHandler {
  private checkWritesEnabled(): void {
    if (!config.writes.enabled) {
      throw {
        code: 'UNAUTHORIZED' as const,
        message: 'Write operations are disabled. Set HELPSCOUT_ENABLE_WRITES=true to enable.',
        details: {},
      };
    }
  }

  private getClient() {
    if (!docsClient) {
      throw new Error('Docs API client not initialized. Set HELPSCOUT_DOCS_API_KEY.');
    }
    return docsClient;
  }

  private jsonResult(data: unknown): CallToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  async listTools(): Promise<Tool[]> {
    if (!config.docs) return [];

    const tools: Tool[] = [
      // ── Sites ──
      {
        name: 'docs_listSites',
        description: 'List all Docs sites in your Help Scout account.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
          },
        },
      },
      {
        name: 'docs_getSite',
        description: 'Get details of a specific Docs site.',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string', description: 'Site ID' },
          },
          required: ['siteId'],
        },
      },
      // ── Collections ──
      {
        name: 'docs_listCollections',
        description: 'List knowledge base collections. Optionally filter by site ID.',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string', description: 'Filter by site ID' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            visibility: { type: 'string', enum: ['all', 'public', 'private'], description: 'Visibility filter' },
            sort: { type: 'string', enum: ['order', 'name', 'createdAt', 'updatedAt'], description: 'Sort field' },
            order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' },
          },
        },
      },
      {
        name: 'docs_getCollection',
        description: 'Get details of a specific knowledge base collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collectionId: { type: 'string', description: 'Collection ID' },
          },
          required: ['collectionId'],
        },
      },
      // ── Categories ──
      {
        name: 'docs_listCategories',
        description: 'List categories within a knowledge base collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collectionId: { type: 'string', description: 'Collection ID' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            sort: { type: 'string', enum: ['order', 'name', 'createdAt', 'updatedAt'], description: 'Sort field' },
            order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' },
          },
          required: ['collectionId'],
        },
      },
      {
        name: 'docs_getCategory',
        description: 'Get details of a specific category.',
        inputSchema: {
          type: 'object',
          properties: {
            categoryId: { type: 'string', description: 'Category ID' },
          },
          required: ['categoryId'],
        },
      },
      // ── Articles ──
      {
        name: 'docs_listArticles',
        description: 'List articles in a collection or category. Provide either collectionId or categoryId.',
        inputSchema: {
          type: 'object',
          properties: {
            collectionId: { type: 'string', description: 'List articles in this collection' },
            categoryId: { type: 'string', description: 'List articles in this category' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            sort: { type: 'string', enum: ['order', 'name', 'createdAt', 'updatedAt', 'popularity', 'viewCount'], description: 'Sort field' },
            order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' },
            status: { type: 'string', enum: ['all', 'published', 'notpublished'], description: 'Filter by status' },
          },
        },
      },
      {
        name: 'docs_getArticle',
        description: 'Get a knowledge base article by ID, including its full HTML content.',
        inputSchema: {
          type: 'object',
          properties: {
            articleId: { type: 'string', description: 'Article ID' },
            draft: { type: 'boolean', description: 'If true, return the draft version' },
          },
          required: ['articleId'],
        },
      },
      {
        name: 'docs_searchArticles',
        description: 'Search knowledge base articles by keyword. Optionally scope to a collection.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            collectionId: { type: 'string', description: 'Limit search to a collection' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            status: { type: 'string', enum: ['all', 'published', 'notpublished'], description: 'Filter by status' },
            visibility: { type: 'string', enum: ['all', 'public', 'private'], description: 'Filter by visibility' },
          },
          required: ['query'],
        },
      },
      {
        name: 'docs_getRelatedArticles',
        description: 'Get articles related to a specific article.',
        inputSchema: {
          type: 'object',
          properties: {
            articleId: { type: 'string', description: 'Article ID' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
          },
          required: ['articleId'],
        },
      },
      {
        name: 'docs_listArticleRevisions',
        description: 'List revision history for an article.',
        inputSchema: {
          type: 'object',
          properties: {
            articleId: { type: 'string', description: 'Article ID' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
          },
          required: ['articleId'],
        },
      },
      {
        name: 'docs_getArticleRevision',
        description: 'Get a specific revision of an article.',
        inputSchema: {
          type: 'object',
          properties: {
            articleId: { type: 'string', description: 'Article ID' },
            revisionId: { type: 'string', description: 'Revision ID' },
          },
          required: ['articleId', 'revisionId'],
        },
      },
      // ── Redirects ──
      {
        name: 'docs_listRedirects',
        description: 'List URL redirects for a Docs site.',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string', description: 'Site ID' },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
          },
          required: ['siteId'],
        },
      },
    ];

    // ── Write tools (gated behind HELPSCOUT_ENABLE_WRITES) ──
    if (config.writes.enabled) {
      tools.push(
        // Collections
        {
          name: 'docs_createCollection',
          description: 'Create a new knowledge base collection.',
          inputSchema: {
            type: 'object',
            properties: {
              siteId: { type: 'string', description: 'Site ID' },
              name: { type: 'string', description: 'Collection name' },
              visibility: { type: 'string', enum: ['public', 'private'], default: 'public', description: 'Visibility' },
              description: { type: 'string', description: 'Collection description' },
              order: { type: 'number', description: 'Display order' },
            },
            required: ['siteId', 'name'],
          },
        },
        {
          name: 'docs_updateCollection',
          description: 'Update an existing knowledge base collection.',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: { type: 'string', description: 'Collection ID' },
              name: { type: 'string', description: 'New name' },
              visibility: { type: 'string', enum: ['public', 'private'], description: 'Visibility' },
              description: { type: 'string', description: 'New description' },
              order: { type: 'number', description: 'Display order' },
            },
            required: ['collectionId'],
          },
        },
        {
          name: 'docs_deleteCollection',
          description: 'Delete a knowledge base collection. WARNING: This deletes all articles and categories within it.',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: { type: 'string', description: 'Collection ID to delete' },
            },
            required: ['collectionId'],
          },
        },
        // Categories
        {
          name: 'docs_createCategory',
          description: 'Create a new category within a collection.',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: { type: 'string', description: 'Collection ID' },
              name: { type: 'string', description: 'Category name' },
              description: { type: 'string', description: 'Category description' },
              order: { type: 'number', description: 'Display order' },
              visibility: { type: 'string', enum: ['public', 'private'], description: 'Visibility' },
            },
            required: ['collectionId', 'name'],
          },
        },
        {
          name: 'docs_updateCategory',
          description: 'Update an existing category.',
          inputSchema: {
            type: 'object',
            properties: {
              categoryId: { type: 'string', description: 'Category ID' },
              name: { type: 'string', description: 'New name' },
              description: { type: 'string', description: 'New description' },
              order: { type: 'number', description: 'Display order' },
              visibility: { type: 'string', enum: ['public', 'private'], description: 'Visibility' },
            },
            required: ['categoryId'],
          },
        },
        {
          name: 'docs_deleteCategory',
          description: 'Delete a category. Articles in this category are not deleted but become uncategorized.',
          inputSchema: {
            type: 'object',
            properties: {
              categoryId: { type: 'string', description: 'Category ID to delete' },
            },
            required: ['categoryId'],
          },
        },
        // Articles
        {
          name: 'docs_createArticle',
          description: 'Create a new knowledge base article. Supports HTML content.',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: { type: 'string', description: 'Collection ID' },
              name: { type: 'string', description: 'Article title' },
              text: { type: 'string', description: 'Article body (HTML)' },
              slug: { type: 'string', description: 'URL slug (auto-generated if omitted)' },
              status: { type: 'string', enum: ['published', 'notpublished'], default: 'published', description: 'Publish status' },
              categories: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
              related: { type: 'array', items: { type: 'string' }, description: 'Related article IDs' },
              keywords: { type: 'array', items: { type: 'string' }, description: 'SEO keywords' },
            },
            required: ['collectionId', 'name', 'text'],
          },
        },
        {
          name: 'docs_updateArticle',
          description: 'Update an existing knowledge base article.',
          inputSchema: {
            type: 'object',
            properties: {
              articleId: { type: 'string', description: 'Article ID' },
              name: { type: 'string', description: 'New title' },
              text: { type: 'string', description: 'New body (HTML)' },
              slug: { type: 'string', description: 'New URL slug' },
              status: { type: 'string', enum: ['published', 'notpublished'], description: 'Publish status' },
              categories: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
              related: { type: 'array', items: { type: 'string' }, description: 'Related article IDs' },
              keywords: { type: 'array', items: { type: 'string' }, description: 'SEO keywords' },
            },
            required: ['articleId'],
          },
        },
        {
          name: 'docs_deleteArticle',
          description: 'Delete a knowledge base article. This is IRREVERSIBLE.',
          inputSchema: {
            type: 'object',
            properties: {
              articleId: { type: 'string', description: 'Article ID to delete' },
            },
            required: ['articleId'],
          },
        },
        // Redirects
        {
          name: 'docs_createRedirect',
          description: 'Create a URL redirect for a Docs site.',
          inputSchema: {
            type: 'object',
            properties: {
              siteId: { type: 'string', description: 'Site ID' },
              urlMapping: { type: 'string', description: 'Old URL path to redirect from' },
              redirect: { type: 'string', description: 'Destination URL to redirect to' },
            },
            required: ['siteId', 'urlMapping', 'redirect'],
          },
        },
        {
          name: 'docs_updateRedirect',
          description: 'Update an existing URL redirect.',
          inputSchema: {
            type: 'object',
            properties: {
              redirectId: { type: 'string', description: 'Redirect ID' },
              urlMapping: { type: 'string', description: 'New old URL path' },
              redirect: { type: 'string', description: 'New destination URL' },
            },
            required: ['redirectId'],
          },
        },
        {
          name: 'docs_deleteRedirect',
          description: 'Delete a URL redirect.',
          inputSchema: {
            type: 'object',
            properties: {
              redirectId: { type: 'string', description: 'Redirect ID to delete' },
            },
            required: ['redirectId'],
          },
        },
      );
    }

    return tools;
  }

  async callTool(request: CallToolRequest): Promise<CallToolResult> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const args = request.params.arguments || {};

    try {
      switch (request.params.name) {
        // Sites
        case 'docs_listSites':
          return await this.listSites(args);
        case 'docs_getSite':
          return await this.getSite(args);
        // Collections
        case 'docs_listCollections':
          return await this.listCollections(args);
        case 'docs_getCollection':
          return await this.getCollection(args);
        case 'docs_createCollection':
          return await this.createCollection(args);
        case 'docs_updateCollection':
          return await this.updateCollection(args);
        case 'docs_deleteCollection':
          return await this.deleteCollection(args);
        // Categories
        case 'docs_listCategories':
          return await this.listCategories(args);
        case 'docs_getCategory':
          return await this.getCategory(args);
        case 'docs_createCategory':
          return await this.createCategory(args);
        case 'docs_updateCategory':
          return await this.updateCategory(args);
        case 'docs_deleteCategory':
          return await this.deleteCategory(args);
        // Articles
        case 'docs_listArticles':
          return await this.listArticles(args);
        case 'docs_getArticle':
          return await this.getArticle(args);
        case 'docs_searchArticles':
          return await this.searchArticles(args);
        case 'docs_getRelatedArticles':
          return await this.getRelatedArticles(args);
        case 'docs_listArticleRevisions':
          return await this.listArticleRevisions(args);
        case 'docs_getArticleRevision':
          return await this.getArticleRevision(args);
        case 'docs_createArticle':
          return await this.createArticle(args);
        case 'docs_updateArticle':
          return await this.updateArticle(args);
        case 'docs_deleteArticle':
          return await this.deleteArticle(args);
        // Redirects
        case 'docs_listRedirects':
          return await this.listRedirects(args);
        case 'docs_createRedirect':
          return await this.createRedirect(args);
        case 'docs_updateRedirect':
          return await this.updateRedirect(args);
        case 'docs_deleteRedirect':
          return await this.deleteRedirect(args);
        default:
          throw new Error(`Unknown docs tool: ${request.params.name}`);
      }
    } catch (error) {
      return createMcpToolError(error, {
        toolName: request.params.name,
        requestId,
        duration: Date.now() - startTime,
      });
    }
  }

  // ── Site Handlers ──

  private async listSites(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListSitesInputSchema.parse(args);
    const client = this.getClient();
    const data = await client.getList<DocsSite>('/sites', 'sites', {
      page: input.page,
    });
    return this.jsonResult({
      sites: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async getSite(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetSiteInputSchema.parse(args);
    const client = this.getClient();
    const site = await client.getOne<DocsSite>(`/sites/${input.siteId}`, 'site');
    return this.jsonResult({ site });
  }

  // ── Collection Handlers ──

  private async listCollections(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListCollectionsInputSchema.parse(args);
    const client = this.getClient();
    const params: Record<string, unknown> = { page: input.page };
    if (input.siteId) params.siteId = input.siteId;
    if (input.visibility) params.visibility = input.visibility;
    if (input.sort) params.sort = input.sort;
    if (input.order) params.order = input.order;

    const data = await client.getList<DocsCollection>('/collections', 'collections', params);
    return this.jsonResult({
      collections: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async getCollection(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetCollectionInputSchema.parse(args);
    const client = this.getClient();
    const collection = await client.getOne<DocsCollection>(`/collections/${input.collectionId}`, 'collection');
    return this.jsonResult({ collection });
  }

  private async createCollection(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsCreateCollectionInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {
      siteId: input.siteId,
      name: input.name,
      visibility: input.visibility,
    };
    if (input.description) body.description = input.description;
    if (input.order !== undefined) body.order = input.order;

    const result = await client.post<{ collection: DocsCollection }>('/collections', body);
    return this.jsonResult({ collection: result.collection || result, message: 'Collection created successfully' });
  }

  private async updateCollection(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsUpdateCollectionInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {};
    if (input.name) body.name = input.name;
    if (input.visibility) body.visibility = input.visibility;
    if (input.description !== undefined) body.description = input.description;
    if (input.order !== undefined) body.order = input.order;

    await client.put(`/collections/${input.collectionId}`, body);
    return this.jsonResult({ message: 'Collection updated successfully' });
  }

  private async deleteCollection(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsDeleteCollectionInputSchema.parse(args);
    const client = this.getClient();
    await client.delete(`/collections/${input.collectionId}`);
    return this.jsonResult({ message: 'Collection deleted successfully' });
  }

  // ── Category Handlers ──

  private async listCategories(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListCategoriesInputSchema.parse(args);
    const client = this.getClient();
    const params: Record<string, unknown> = { page: input.page };
    if (input.sort) params.sort = input.sort;
    if (input.order) params.order = input.order;

    const data = await client.getList<DocsCategory>(
      `/collections/${input.collectionId}/categories`, 'categories', params,
    );
    return this.jsonResult({
      categories: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async getCategory(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetCategoryInputSchema.parse(args);
    const client = this.getClient();
    const category = await client.getOne<DocsCategory>(`/categories/${input.categoryId}`, 'category');
    return this.jsonResult({ category });
  }

  private async createCategory(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsCreateCategoryInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {
      collectionId: input.collectionId,
      name: input.name,
    };
    if (input.description) body.description = input.description;
    if (input.order !== undefined) body.order = input.order;
    if (input.visibility) body.visibility = input.visibility;

    const result = await client.post<{ category: DocsCategory }>('/categories', body);
    return this.jsonResult({ category: result.category || result, message: 'Category created successfully' });
  }

  private async updateCategory(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsUpdateCategoryInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {};
    if (input.name) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.order !== undefined) body.order = input.order;
    if (input.visibility) body.visibility = input.visibility;

    await client.put(`/categories/${input.categoryId}`, body);
    return this.jsonResult({ message: 'Category updated successfully' });
  }

  private async deleteCategory(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsDeleteCategoryInputSchema.parse(args);
    const client = this.getClient();
    await client.delete(`/categories/${input.categoryId}`);
    return this.jsonResult({ message: 'Category deleted successfully' });
  }

  // ── Article Handlers ──

  private async listArticles(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListArticlesInputSchema.parse(args);
    const client = this.getClient();

    const params: Record<string, unknown> = { page: input.page };
    if (input.sort) params.sort = input.sort;
    if (input.order) params.order = input.order;
    if (input.status) params.status = input.status;

    let endpoint: string;
    if (input.categoryId) {
      endpoint = `/categories/${input.categoryId}/articles`;
    } else {
      endpoint = `/collections/${input.collectionId}/articles`;
    }

    const data = await client.getList<DocsArticleRef>(endpoint, 'articles', params);
    return this.jsonResult({
      articles: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async getArticle(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetArticleInputSchema.parse(args);
    const client = this.getClient();
    const params: Record<string, unknown> = {};
    if (input.draft) params.draft = true;

    const article = await client.getOne<DocsArticle>(`/articles/${input.articleId}`, 'article', params);
    return this.jsonResult({ article });
  }

  private async searchArticles(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsSearchArticlesInputSchema.parse(args);
    const client = this.getClient();

    const params: Record<string, unknown> = {
      query: input.query,
      page: input.page,
    };
    if (input.collectionId) params.collectionId = input.collectionId;
    if (input.status) params.status = input.status;
    if (input.visibility) params.visibility = input.visibility;

    const data = await client.getList<DocsArticleRef>('/search/articles', 'articles', params);
    return this.jsonResult({
      articles: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
      query: input.query,
    });
  }

  private async getRelatedArticles(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetRelatedArticlesInputSchema.parse(args);
    const client = this.getClient();
    const data = await client.getList<DocsArticleRef>(
      `/articles/${input.articleId}/related`, 'articles', { page: input.page },
    );
    return this.jsonResult({
      articles: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async listArticleRevisions(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListArticleRevisionsInputSchema.parse(args);
    const client = this.getClient();
    const data = await client.getList<DocsRevision>(
      `/articles/${input.articleId}/revisions`, 'revisions', { page: input.page },
    );
    return this.jsonResult({
      revisions: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async getArticleRevision(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsGetArticleRevisionInputSchema.parse(args);
    const client = this.getClient();
    const revision = await client.getOne<DocsRevision>(
      `/articles/${input.articleId}/revisions/${input.revisionId}`, 'revision',
    );
    return this.jsonResult({ revision });
  }

  private async createArticle(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsCreateArticleInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {
      collectionId: input.collectionId,
      name: input.name,
      text: input.text,
      status: input.status,
    };
    if (input.slug) body.slug = input.slug;
    if (input.categories) body.categories = input.categories;
    if (input.related) body.related = input.related;
    if (input.keywords) body.keywords = input.keywords;

    const result = await client.post<{ article: DocsArticle }>('/articles', body);
    return this.jsonResult({ article: result.article || result, message: 'Article created successfully' });
  }

  private async updateArticle(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsUpdateArticleInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {};
    if (input.name) body.name = input.name;
    if (input.text) body.text = input.text;
    if (input.slug) body.slug = input.slug;
    if (input.status) body.status = input.status;
    if (input.categories) body.categories = input.categories;
    if (input.related) body.related = input.related;
    if (input.keywords) body.keywords = input.keywords;

    await client.put(`/articles/${input.articleId}`, body);
    return this.jsonResult({ message: 'Article updated successfully' });
  }

  private async deleteArticle(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsDeleteArticleInputSchema.parse(args);
    const client = this.getClient();
    await client.delete(`/articles/${input.articleId}`);
    return this.jsonResult({ message: 'Article deleted successfully' });
  }

  // ── Redirect Handlers ──

  private async listRedirects(args: Record<string, unknown>): Promise<CallToolResult> {
    const input = DocsListRedirectsInputSchema.parse(args);
    const client = this.getClient();
    const data = await client.getList<DocsRedirect>('/redirects', 'redirects', {
      siteId: input.siteId,
      page: input.page,
    });
    return this.jsonResult({
      redirects: data.items,
      pagination: { page: data.page, pages: data.pages, count: data.count },
    });
  }

  private async createRedirect(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsCreateRedirectInputSchema.parse(args);
    const client = this.getClient();

    const result = await client.post<{ redirect: DocsRedirect }>('/redirects', {
      siteId: input.siteId,
      urlMapping: input.urlMapping,
      redirect: input.redirect,
    });
    return this.jsonResult({ redirect: result.redirect || result, message: 'Redirect created successfully' });
  }

  private async updateRedirect(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsUpdateRedirectInputSchema.parse(args);
    const client = this.getClient();

    const body: Record<string, unknown> = {};
    if (input.urlMapping) body.urlMapping = input.urlMapping;
    if (input.redirect) body.redirect = input.redirect;

    await client.put(`/redirects/${input.redirectId}`, body);
    return this.jsonResult({ message: 'Redirect updated successfully' });
  }

  private async deleteRedirect(args: Record<string, unknown>): Promise<CallToolResult> {
    this.checkWritesEnabled();
    const input = DocsDeleteRedirectInputSchema.parse(args);
    const client = this.getClient();
    await client.delete(`/redirects/${input.redirectId}`);
    return this.jsonResult({ message: 'Redirect deleted successfully' });
  }
}

// Export singleton — only when Docs API is configured
export const docsToolHandler = config.docs ? new DocsToolHandler() : null;
