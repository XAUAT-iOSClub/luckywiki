import Link from "next/link";
import { ArticleStatus } from "@/generated/prisma/enums";
import { buildWikiHref } from "@/lib/wiki-path";
import { listAdminArticles } from "@/lib/articles";

export default async function AdminArticlesPage() {
  const articles = await listAdminArticles();

  return (
    <section className="surface-panel space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Articles</p>
          <h2 className="text-2xl font-semibold">Manage wiki content</h2>
        </div>
        <Link className="button-primary" href="/admin/articles/new">
          New article
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-3">Title</th>
              <th className="pb-3">Path</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Author</th>
              <th className="pb-3">Comments</th>
              <th className="pb-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-t border-border/70">
                <td className="py-4">
                  <Link className="font-medium hover:text-primary" href={`/admin/articles/${article.id}`}>
                    {article.title}
                  </Link>
                </td>
                <td className="py-4 text-muted-foreground">{article.path || "(root)"}</td>
                <td className="py-4">
                  <span className={article.status === ArticleStatus.PUBLISHED ? "status-pill status-pill-success" : "status-pill"}>
                    {article.status.toLowerCase()}
                  </span>
                </td>
                <td className="py-4 text-muted-foreground">{article.author.name}</td>
                <td className="py-4 text-muted-foreground">{article._count.comments}</td>
                <td className="py-4 text-muted-foreground">
                  <div>{article.updatedAt.toLocaleDateString()}</div>
                  {article.status === ArticleStatus.PUBLISHED ? (
                    <Link className="mt-1 inline-block text-primary hover:underline" href={buildWikiHref(article.path)}>
                      View live
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
