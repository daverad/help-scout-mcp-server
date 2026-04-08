import { z } from 'zod';

// ── Docs API Data Models ───────────────────────────────────────────

export const DocsSiteSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  subDomain: z.string().optional(),
  cname: z.string().nullable().optional(),
  hasPublicSite: z.boolean().optional(),
  companyName: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  logoWidth: z.number().nullable().optional(),
  logoHeight: z.number().nullable().optional(),
  favIconUrl: z.string().nullable().optional(),
  touchIconUrl: z.string().nullable().optional(),
  homeUrl: z.string().nullable().optional(),
  homeLinkText: z.string().nullable().optional(),
  contactUrl: z.string().nullable().optional(),
  styleSheetUrl: z.string().nullable().optional(),
  headerCode: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocsCollectionSchema = z.object({
  id: z.string(),
  siteId: z.string().optional(),
  number: z.number().optional(),
  slug: z.string().optional(),
  visibility: z.string().optional(),
  order: z.number().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  publicUrl: z.string().nullable().optional(),
  articleCount: z.number().optional(),
  publishedArticleCount: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocsCategorySchema = z.object({
  id: z.string(),
  collectionId: z.string().optional(),
  number: z.number().optional(),
  slug: z.string().optional(),
  visibility: z.string().optional(),
  order: z.number().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  articleCount: z.number().optional(),
  publishedArticleCount: z.number().optional(),
  publicUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocsArticleSchema = z.object({
  id: z.string(),
  collectionId: z.string().optional(),
  number: z.number().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
  name: z.string(),
  text: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  publicUrl: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  hasDraft: z.boolean().optional(),
  lastPublishedAt: z.string().nullable().optional(),
  createdBy: z.number().nullable().optional(),
  updatedBy: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocsArticleRefSchema = z.object({
  id: z.string(),
  collectionId: z.string().optional(),
  number: z.number().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
  name: z.string(),
  publicUrl: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocsRevisionSchema = z.object({
  id: z.string(),
  articleId: z.string().optional(),
  createdBy: z.union([
    z.object({
      id: z.number(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }),
    z.number(),
  ]).nullable().optional(),
  createdAt: z.string().optional(),
});

export const DocsRedirectSchema = z.object({
  id: z.string(),
  siteId: z.string().optional(),
  urlMapping: z.string().optional(),
  redirect: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Input Schemas for Tools ────────────────────────────────────────

// Sites
export const DocsListSitesInputSchema = z.object({
  page: z.number().min(1).default(1),
});

export const DocsGetSiteInputSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
});

// Collections
export const DocsListCollectionsInputSchema = z.object({
  siteId: z.string().optional().describe('Filter by site ID'),
  page: z.number().min(1).default(1),
  visibility: z.enum(['all', 'public', 'private']).optional(),
  sort: z.enum(['order', 'name', 'createdAt', 'updatedAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const DocsGetCollectionInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
});

export const DocsCreateCollectionInputSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  name: z.string().min(1, 'Collection name is required'),
  visibility: z.enum(['public', 'private']).default('public'),
  description: z.string().optional(),
  order: z.number().optional(),
});

export const DocsUpdateCollectionInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
  name: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  description: z.string().optional(),
  order: z.number().optional(),
});

export const DocsDeleteCollectionInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
});

// Categories
export const DocsListCategoriesInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
  page: z.number().min(1).default(1),
  sort: z.enum(['order', 'name', 'createdAt', 'updatedAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const DocsGetCategoryInputSchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
});

export const DocsCreateCategoryInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  order: z.number().optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export const DocsUpdateCategoryInputSchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
  name: z.string().optional(),
  description: z.string().optional(),
  order: z.number().optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export const DocsDeleteCategoryInputSchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
});

// Articles
export const DocsListArticlesInputSchema = z.object({
  collectionId: z.string().optional().describe('List articles in this collection'),
  categoryId: z.string().optional().describe('List articles in this category'),
  page: z.number().min(1).default(1),
  sort: z.enum(['order', 'name', 'createdAt', 'updatedAt', 'popularity', 'viewCount']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  status: z.enum(['all', 'published', 'notpublished']).optional(),
}).refine(
  (data) => data.collectionId || data.categoryId,
  { message: 'Either collectionId or categoryId is required' },
);

export const DocsGetArticleInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  draft: z.boolean().optional().describe('If true, return the draft version'),
});

export const DocsSearchArticlesInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  collectionId: z.string().optional().describe('Limit search to a collection'),
  page: z.number().min(1).default(1),
  status: z.enum(['all', 'published', 'notpublished']).optional(),
  visibility: z.enum(['all', 'public', 'private']).optional(),
});

export const DocsGetRelatedArticlesInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  page: z.number().min(1).default(1),
});

export const DocsListArticleRevisionsInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  page: z.number().min(1).default(1),
});

export const DocsGetArticleRevisionInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  revisionId: z.string().min(1, 'Revision ID is required'),
});

export const DocsCreateArticleInputSchema = z.object({
  collectionId: z.string().min(1, 'Collection ID is required'),
  name: z.string().min(1, 'Article title is required'),
  text: z.string().min(1, 'Article text/HTML is required'),
  slug: z.string().optional(),
  status: z.enum(['published', 'notpublished']).default('published'),
  categories: z.array(z.string()).optional().describe('Array of category IDs'),
  related: z.array(z.string()).optional().describe('Array of related article IDs'),
  keywords: z.array(z.string()).optional(),
});

export const DocsUpdateArticleInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  name: z.string().optional(),
  text: z.string().optional(),
  slug: z.string().optional(),
  status: z.enum(['published', 'notpublished']).optional(),
  categories: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export const DocsDeleteArticleInputSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
});

// Redirects
export const DocsListRedirectsInputSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  page: z.number().min(1).default(1),
});

export const DocsCreateRedirectInputSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  urlMapping: z.string().min(1, 'URL mapping (old path) is required'),
  redirect: z.string().min(1, 'Redirect destination URL is required'),
});

export const DocsUpdateRedirectInputSchema = z.object({
  redirectId: z.string().min(1, 'Redirect ID is required'),
  urlMapping: z.string().optional(),
  redirect: z.string().optional(),
});

export const DocsDeleteRedirectInputSchema = z.object({
  redirectId: z.string().min(1, 'Redirect ID is required'),
});

// ── Type Exports ───────────────────────────────────────────────────

export type DocsSite = z.infer<typeof DocsSiteSchema>;
export type DocsCollection = z.infer<typeof DocsCollectionSchema>;
export type DocsCategory = z.infer<typeof DocsCategorySchema>;
export type DocsArticle = z.infer<typeof DocsArticleSchema>;
export type DocsArticleRef = z.infer<typeof DocsArticleRefSchema>;
export type DocsRevision = z.infer<typeof DocsRevisionSchema>;
export type DocsRedirect = z.infer<typeof DocsRedirectSchema>;
