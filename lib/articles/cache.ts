import { revalidatePath, revalidateTag } from "next/cache";
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
