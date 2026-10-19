import { notFound } from "next/navigation";
import { createArticleAction } from "@/app/actions/admin";
import { generateArticleSummaryAction } from "@/app/actions/summary";
import { ArticleEditor } from "@/components/article-editor";
import { isOpenAiConfigured } from "@/lib/openai/base-url";
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
  const summaryAction = isOpenAiConfigured()
    ? generateArticleSummaryAction.bind(null, lang)
    : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ArticleEditor
        action={createArticleAction.bind(null, lang)}
        initialState={{}}
        summaryAction={summaryAction}
        submitLabel={dictionary.admin.createArticle}
      />
    </div>
  );
}
