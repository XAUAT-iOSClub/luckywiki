import { notFound } from "next/navigation";
import { updateArticleAction } from "@/app/actions/admin";
import { ArticleEditor } from "@/components/article-editor";
import { getArticleById } from "@/lib/articles";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale } from "@/lib/i18n/config";

type Params = Promise<{ lang: string; id: string }>;

export default async function EditArticlePage({
  params,
}: {
  params: Params;
}) {
  const { lang, id } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [article, dictionary] = await Promise.all([
    getArticleById(id),
    getDictionary(lang),
  ]);

  if (!article) {
    notFound();
  }

  return (
    <section className="surface-panel space-y-6">
      <div>
        <p className="eyebrow">{dictionary.admin.editArticleEyebrow}</p>
        <h2 className="text-2xl font-semibold">{article.title}</h2>
      </div>
      <ArticleEditor
        action={updateArticleAction.bind(null, article.id, lang)}
        initialState={{}}
        initialValues={article}
        submitLabel={dictionary.admin.saveArticleChanges}
      />
    </section>
  );
}
