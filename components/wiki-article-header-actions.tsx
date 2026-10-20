import { headers } from "next/headers";
import { WikiArticleActionsController } from "@/components/wiki-article-actions";
import { getPublishedArticleByPath } from "@/lib/articles";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { getWikiArticlePathFromPathname } from "@/lib/wiki/path";
import { WIKI_PATHNAME_HEADER } from "@/lib/wiki/request-headers";

/**
 * Renders the Wiki.js-style page actions in the site header.
 *
 * This component reads request-time data, so it must stay inside a Suspense
 * boundary (see `WikiShell`) to keep the rest of the page prerenderable.
 *
 * The initial article is resolved on the server for the first paint. Layouts
 * are not re-rendered during client-side navigation, so the client controller
 * takes over and resolves the article for subsequent paths.
 */
export async function WikiArticleHeaderActions() {
  const [session, requestHeaders] = await Promise.all([
    getCurrentSession(),
    headers(),
  ]);

  if (!canWriteArticles(session?.user ?? null)) {
    return null;
  }

  const pathname = requestHeaders.get(WIKI_PATHNAME_HEADER);
  const path = pathname ? getWikiArticlePathFromPathname(pathname) : null;
  const article = path ? await getPublishedArticleByPath(path) : null;

  return (
    <WikiArticleActionsController
      initialArticle={
        article
          ? {
              id: article.id,
              path: article.path,
              title: article.title,
            }
          : null
      }
      initialPath={path}
    />
  );
}
