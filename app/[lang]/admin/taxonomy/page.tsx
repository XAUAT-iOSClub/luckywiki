import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FolderTree, Tags } from "lucide-react";
import {
  EmptyState,
  List,
  Page,
  PageHeader,
  Panel,
} from "@/components/ui/page-ui";
import { listAdminTaxonomy } from "@/lib/admin";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";

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

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [taxonomy, dictionary] = await Promise.all([
    listAdminTaxonomy(),
    getDictionary(lang),
  ]);

  return (
    <Page>
      <PageHeader
        actions={
          <p className="text-[12px] tabular-nums text-muted-foreground">
            {formatNumber(lang, taxonomy.sections.length)}{" "}
            {dictionary.common.sections.toLowerCase()}
            <span className="px-1.5">·</span>
            {formatNumber(lang, taxonomy.tags.length)}{" "}
            {dictionary.common.tags.toLowerCase()}
          </p>
        }
        description={dictionary.admin.taxonomyDescription}
        title={dictionary.common.taxonomy}
      />

      <div className="grid gap-7 xl:grid-cols-2">
        <Panel
          description={dictionary.admin.groupArticlesBy}
          title={
            <span className="inline-flex items-center gap-2">
              <FolderTree className="size-4 text-muted-foreground" />
              {dictionary.admin.sections}
            </span>
          }
        >
          {taxonomy.sections.length === 0 ? (
            <EmptyState
              description={dictionary.admin.noArticlesFound}
              icon={FolderTree}
              title={dictionary.admin.noArticlesMatchFilters}
            />
          ) : (
            <List>
              {taxonomy.sections.map((section) => (
                <Link
                  key={section.slug || "root"}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                  href={localizeHref(
                    lang,
                    `/admin/articles?section=${encodeURIComponent(section.slug)}`,
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[13.5px] font-medium text-foreground">
                        {section.slug ? section.label : dictionary.common.root}
                      </p>
                      <span className="font-mono text-[11.5px] text-muted-foreground">
                        /{section.slug}
                      </span>
                    </div>
                    {section.sampleTitles.length > 0 ? (
                      <p className="truncate text-[12px] text-muted-foreground">
                        {section.sampleTitles.slice(0, 3).join(" · ")}
                      </p>
                    ) : null}
                    <p className="text-[11.5px] text-muted-foreground/80">
                      {formatDateTime(lang, section.latestUpdatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="text-[15px] font-semibold leading-5 tabular-nums">
                        {formatNumber(lang, section.totalArticles)}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                        {formatNumber(lang, section.publishedArticles)}{" "}
                        {dictionary.common.published}
                        <span className="px-1">·</span>
                        {formatNumber(lang, section.draftArticles)}{" "}
                        {dictionary.common.draft}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground/60" />
                  </div>
                </Link>
              ))}
            </List>
          )}
        </Panel>

        <Panel
          description={dictionary.admin.trackTopics}
          title={
            <span className="inline-flex items-center gap-2">
              <Tags className="size-4 text-muted-foreground" />
              {dictionary.admin.tagsTitle}
            </span>
          }
        >
          {taxonomy.tags.length === 0 ? (
            <EmptyState
              description={dictionary.admin.noTagsYet}
              icon={Tags}
              title={dictionary.admin.noTagsYet}
            />
          ) : (
            <List>
              {taxonomy.tags.map((tag) => (
                <Link
                  key={tag.tag}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                  href={localizeHref(
                    lang,
                    `/admin/articles?tag=${encodeURIComponent(tag.tag)}`,
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-[13.5px] font-medium text-foreground">
                      #{tag.tag}
                    </p>
                    {tag.sampleTitles.length > 0 ? (
                      <p className="truncate text-[12px] text-muted-foreground">
                        {tag.sampleTitles.slice(0, 3).join(" · ")}
                      </p>
                    ) : null}
                    <p className="text-[11.5px] text-muted-foreground/80">
                      {formatDateTime(lang, tag.latestUpdatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="text-[15px] font-semibold leading-5 tabular-nums">
                        {formatNumber(lang, tag.totalArticles)}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                        {formatNumber(lang, tag.publishedArticles)}{" "}
                        {dictionary.common.published}
                        <span className="px-1">·</span>
                        {formatNumber(lang, tag.draftArticles)}{" "}
                        {dictionary.common.draft}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground/60" />
                  </div>
                </Link>
              ))}
            </List>
          )}
        </Panel>
      </div>
    </Page>
  );
}
