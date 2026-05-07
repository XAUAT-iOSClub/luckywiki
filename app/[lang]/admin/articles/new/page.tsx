import { notFound } from "next/navigation";
import { createArticleAction } from "@/app/actions/admin";
import { ArticleEditor } from "@/components/article-editor";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale } from "@/lib/i18n/config";

type Params = Promise<{ lang: string }>;

export default async function NewArticlePage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return (
    <section className="surface-panel space-y-6">
      <div>
        <p className="eyebrow">{dictionary.admin.newArticleEyebrow}</p>
        <h2 className="text-2xl font-semibold">{dictionary.admin.newArticleTitle}</h2>
      </div>
      <ArticleEditor
        action={createArticleAction.bind(null, lang)}
        initialState={{}}
        submitLabel={dictionary.admin.createArticle}
      />
    </section>
  );
}
