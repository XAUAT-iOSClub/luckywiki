import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { updateArticleAction } from "@/app/actions/admin";
import { ArticleEditor } from "@/components/article-editor";
import { getArticleById } from "@/lib/articles";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-10 pb-20">
      <header className="flex flex-col gap-4 px-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground">
            <Link href={localizeHref(lang, "/admin/articles")}>
              <ChevronLeft className="size-4 mr-1" />
              {dictionary.common.articles}
            </Link>
          </Button>
        </div>
        
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">{dictionary.admin.editArticleEyebrow}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild className="rounded-full px-4 h-9 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-border/50">
              <Link href={localizeHref(lang, `/wiki/${article.path}`)} target="_blank">
                <ExternalLink className="size-3.5 mr-2" />
                {dictionary.common.viewLive}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <ArticleEditor
        action={updateArticleAction.bind(null, article.id, lang)}
        initialState={{}}
        initialValues={article}
        submitLabel={dictionary.admin.saveArticleChanges}
      />
    </div>
  );
}
