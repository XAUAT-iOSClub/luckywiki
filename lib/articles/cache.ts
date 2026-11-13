import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import {
  articleCacheTag,
  articleCommentsCacheTag,
  ARTICLES_CACHE_TAG,
} from "@/lib/cache-tags";
import { locales } from "@/lib/i18n/config";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { buildWikiHref } from "@/lib/wiki/path";

/**
 * 让文章列表、详情与评论缓存失效。
 * Route Handler 不能用 updateTag（仅限 Server Action），这里统一用 revalidateTag。
 */
export function invalidateArticleCache(path: string, articleId: string) {
  revalidateTag(ARTICLES_CACHE_TAG, { expire: 0 });
  revalidateTag(articleCacheTag(path), { expire: 0 });
  revalidateTag(articleCommentsCacheTag(articleId), { expire: 0 });
}

/** 让 wiki 总览与多语言文章页重新验证 */
export function revalidateWikiPaths(path: string) {
  revalidateLocalizedPath("/wiki");

  for (const locale of locales) {
    revalidatePath(buildWikiHref(path, locale));
  }
}

/** 让后台文章相关页面重新验证 */
export function revalidateAdminArticlePaths(articleId?: string) {
  if (articleId) {
    revalidateLocalizedPath(`/admin/articles/${articleId}`);
    revalidateLocalizedPath(`/admin/articles/${articleId}/history`);
  }
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");
}

export type PathChangeCacheInput = {
  oldPaths: string[];
  newPaths: string[];
  articleIds: string[];
  rewrittenPaths?: string[];
  rewrittenArticleIds?: string[];
};

/**
 * Invalidates every cache touched by a path change: article detail tags for
 * old and new paths, the shared list/tree tag (sidebar, taxonomy, sitemap),
 * comments tags, wiki pages and the affected admin pages.
 *
 * Server Actions pass `mode: "action"` so `updateTag` gives read-your-own-writes
 * semantics; Route Handlers must use `revalidateTag` instead.
 */
export function invalidatePathChangeCaches(
  input: PathChangeCacheInput,
  options?: { mode?: "action" | "route" },
) {
  const mode = options?.mode ?? "route";
  const invalidateTag =
    mode === "action"
      ? (tag: string) => updateTag(tag)
      : (tag: string) => revalidateTag(tag, { expire: 0 });

  invalidateTag(ARTICLES_CACHE_TAG);

  const paths = new Set([
    ...input.oldPaths,
    ...input.newPaths,
    ...(input.rewrittenPaths ?? []),
  ]);

  for (const path of paths) {
    invalidateTag(articleCacheTag(path));
    revalidateWikiPaths(path);
  }

  const articleIds = new Set([
    ...input.articleIds,
    ...(input.rewrittenArticleIds ?? []),
  ]);

  for (const articleId of articleIds) {
    invalidateTag(articleCommentsCacheTag(articleId));
    revalidateLocalizedPath(`/admin/articles/${articleId}`);
    revalidateLocalizedPath(`/admin/articles/${articleId}/history`);
  }

  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");
  revalidateLocalizedPath("/admin/users");
}
