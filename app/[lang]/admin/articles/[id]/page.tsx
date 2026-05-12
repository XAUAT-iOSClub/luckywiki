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
    <div className="flex flex-col flex-1 min-h-0">
      <ArticleEditor
        action={updateArticleAction.bind(null, article.id, lang)}
        initialState={{}}
        initialValues={article}
        submitLabel={dictionary.admin.saveArticleChanges}
      />
    </div>
  );
}
