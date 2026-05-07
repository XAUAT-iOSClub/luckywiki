import { notFound } from "next/navigation";
import { updateArticleAction } from "@/app/actions/admin";
import { ArticleEditor } from "@/components/article-editor";
import { getArticleById } from "@/lib/articles";

type Params = Promise<{ id: string }>;

export default async function EditArticlePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  return (
    <section className="surface-panel space-y-6">
      <div>
        <p className="eyebrow">Edit Article</p>
        <h2 className="text-2xl font-semibold">{article.title}</h2>
      </div>
      <ArticleEditor
        action={updateArticleAction.bind(null, article.id)}
        initialState={{}}
        initialValues={article}
        submitLabel="Save changes"
      />
    </section>
  );
}
