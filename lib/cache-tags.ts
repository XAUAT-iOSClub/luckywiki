export const ARTICLES_CACHE_TAG = "articles";

export function articleCacheTag(path: string) {
  return `article:${path}`;
}

export function articleCommentsCacheTag(articleId: string) {
  return `article-comments:${articleId}`;
}
