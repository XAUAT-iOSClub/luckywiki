import Link from "next/link";
import { FolderTree, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAdminTaxonomy } from "@/lib/admin";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { notFound } from "next/navigation";

type Params = Promise<{ lang: string }>;

export default async function AdminTaxonomyPage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [taxonomy, dictionary] = await Promise.all([
    listAdminTaxonomy(),
    getDictionary(lang),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <p className="eyebrow">{dictionary.admin.taxonomyEyebrow}</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{dictionary.admin.taxonomyTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              {dictionary.admin.taxonomyDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {formatNumber(lang, taxonomy.sections.length)} {dictionary.common.sections.toLowerCase()}
            </Badge>
            <Badge variant="secondary">
              {formatNumber(lang, taxonomy.tags.length)} {dictionary.common.tags.toLowerCase()}
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-5 text-primary" />
              {dictionary.admin.sections}
            </CardTitle>
            <CardDescription>{dictionary.admin.groupArticlesBy}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {taxonomy.sections.map((section) => (
              <div
                key={section.slug || "root"}
                className="rounded-[1.5rem] border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium">{section.slug ? section.label : dictionary.common.root}</h2>
                      <Badge variant="secondary">
                        {formatTemplate(dictionary.admin.articlesCount, {
                          count: formatNumber(lang, section.totalArticles),
                        })}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(lang, section.publishedArticles)} {dictionary.common.published.toLowerCase()} ·{" "}
                      {formatNumber(lang, section.draftArticles)} {dictionary.common.draft.toLowerCase()} ·{" "}
                      {formatNumber(lang, section.totalComments)} {dictionary.common.comments.toLowerCase()}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {section.sampleTitles.map((title) => (
                        <Badge key={title} variant="outline">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground lg:text-right">
                    <p>{formatDateTime(lang, section.latestUpdatedAt)}</p>
                    <Link
                      href={localizeHref(lang, `/admin/articles?section=${encodeURIComponent(section.slug)}`)}
                      className="mt-2 inline-flex font-medium text-primary"
                    >
                      {dictionary.admin.openArticles}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="size-5 text-primary" />
              {dictionary.admin.tagsTitle}
            </CardTitle>
            <CardDescription>{dictionary.admin.trackTopics}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {taxonomy.tags.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-border p-4 text-sm text-muted-foreground">
                {dictionary.admin.noTagsYet}
              </p>
            ) : (
              taxonomy.tags.map((tag) => (
                <div
                  key={tag.tag}
                  className="rounded-[1.5rem] border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-medium">{tag.tag}</h2>
                        <Badge variant="secondary">
                          {formatTemplate(dictionary.admin.articlesCount, {
                            count: formatNumber(lang, tag.totalArticles),
                          })}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(lang, tag.publishedArticles)} {dictionary.common.published.toLowerCase()} ·{" "}
                        {formatNumber(lang, tag.draftArticles)} {dictionary.common.draft.toLowerCase()} ·{" "}
                        {formatNumber(lang, tag.totalComments)} {dictionary.common.comments.toLowerCase()}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {tag.sampleTitles.map((title) => (
                          <Badge key={title} variant="outline">
                            {title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground lg:text-right">
                      <p>{formatDateTime(lang, tag.latestUpdatedAt)}</p>
                      <Link
                        href={localizeHref(lang, `/admin/articles?tag=${encodeURIComponent(tag.tag)}`)}
                        className="mt-2 inline-flex font-medium text-primary"
                      >
                        {dictionary.admin.filterArticlesAction}
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
