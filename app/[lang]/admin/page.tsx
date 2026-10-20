import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  ExternalLink,
  FileText,
  FolderTree,
  MessageSquare,
  Plus,
} from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  List,
  ListRow,
  Metrics,
  Page,
  PageHeader,
  Panel,
  StatusDot,
} from "@/components/ui/page-ui";
import { getAdminDashboardData } from "@/lib/admin";
import { buildWikiHref } from "@/lib/wiki/path";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";

type Params = Promise<{ lang: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Admin",
    robots: { index: false, follow: false },
  };
}

export default async function AdminHomePage({ params }: { params: Params }) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [dashboard, dictionary] = await Promise.all([
    getAdminDashboardData(),
    getDictionary(lang),
  ]);

  const metrics = [
    {
      label: dictionary.admin.metrics.articles,
      value: formatNumber(lang, dashboard.totals.articles),
      detail: formatTemplate(dictionary.admin.metrics.articlesDetail, {
        published: formatNumber(lang, dashboard.totals.publishedArticles),
        drafts: formatNumber(lang, dashboard.totals.draftArticles),
      }),
      href: localizeHref(lang, "/admin/articles"),
    },
    {
      label: dictionary.admin.metrics.moderation,
      value: formatNumber(lang, dashboard.totals.pendingComments),
      detail: formatTemplate(dictionary.admin.metrics.moderationDetail, {
        approved: formatNumber(lang, dashboard.totals.approvedComments),
        rejected: formatNumber(lang, dashboard.totals.rejectedComments),
      }),
      href: localizeHref(lang, "/admin/comments?status=PENDING"),
    },
    {
      label: dictionary.admin.metrics.structure,
      value: formatNumber(lang, dashboard.totals.sections),
      detail: formatTemplate(dictionary.admin.metrics.structureDetail, {
        tags: formatNumber(lang, dashboard.totals.tags),
      }),
      href: localizeHref(lang, "/admin/taxonomy"),
    },
    {
      label: dictionary.admin.metrics.contributors,
      value: formatNumber(lang, dashboard.totals.users),
      detail: formatTemplate(dictionary.admin.metrics.contributorsDetail, {
        verified: formatNumber(lang, dashboard.totals.verifiedUsers),
        authors: formatNumber(lang, dashboard.totals.authorUsers),
        admins: formatNumber(lang, dashboard.totals.rootUsers),
      }),
      href: localizeHref(lang, "/admin/users"),
    },
  ];

  return (
    <Page>
      <PageHeader
        actions={
          <Button asChild size="sm">
            <Link href={localizeHref(lang, "/admin/articles/new")}>
              <Plus data-icon="inline-start" />
              {dictionary.admin.createArticle}
            </Link>
          </Button>
        }
        description={dictionary.admin.dashboardDescription}
        title={dictionary.common.dashboard}
      />

      <Metrics items={metrics} />

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel
          description={dictionary.admin.recentlyUpdatedDescription}
          title={dictionary.admin.recentlyUpdated}
        >
          {dashboard.recentArticles.length === 0 ? (
            <EmptyState
              description={dictionary.admin.noArticlesFound}
              icon={FileText}
              title={dictionary.admin.noArticlesMatchFilters}
            />
          ) : (
            <List>
              {dashboard.recentArticles.map((article) => (
                <ListRow key={article.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <Link
                        className="block truncate text-[13.5px] font-medium text-foreground transition-colors hover:text-primary"
                        href={localizeHref(lang, `/admin/articles/${article.id}`)}
                      >
                        {article.title}
                      </Link>
                      <p className="truncate text-[12px] text-muted-foreground">
                        <span className="font-mono">/{article.path}</span>
                        <span className="px-1.5 text-border">·</span>
                        {article.author.name}
                        <span className="px-1.5 text-border">·</span>
                        {formatDateTime(lang, article.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusDot
                        tone={
                          article.status === ArticleStatus.PUBLISHED
                            ? "success"
                            : "muted"
                        }
                      >
                        {article.status === ArticleStatus.PUBLISHED
                          ? dictionary.common.published
                          : dictionary.common.draft}
                      </StatusDot>
                      {article.status === ArticleStatus.PUBLISHED ? (
                        <Button asChild size="icon-xs" variant="ghost">
                          <Link
                            aria-label={dictionary.common.viewLive}
                            href={buildWikiHref(article.path, lang)}
                            target="_blank"
                          >
                            <ExternalLink />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </ListRow>
              ))}
            </List>
          )}
        </Panel>

        <Panel
          description={dictionary.admin.pendingCommentsDescription}
          title={dictionary.admin.pendingComments}
        >
          {dashboard.pendingComments.length === 0 ? (
            <EmptyState
              description={dictionary.admin.pendingCommentsDescription}
              icon={MessageSquare}
              title={dictionary.admin.noPendingComments}
            />
          ) : (
            <List>
              {dashboard.pendingComments.map((comment) => (
                <ListRow key={comment.id}>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[12.5px] font-medium">
                        {comment.author.name}
                      </p>
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">
                        {formatDateTime(lang, comment.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                      {comment.body}
                    </p>
                    <Link
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-opacity hover:opacity-80"
                      href={localizeHref(lang, "/admin/comments?status=PENDING")}
                    >
                      {formatTemplate(dictionary.admin.reviewOn, {
                        title: comment.article.title,
                      })}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                </ListRow>
              ))}
            </List>
          )}
        </Panel>
      </div>

      <Panel
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={localizeHref(lang, "/admin/taxonomy")}>
              {dictionary.admin.openTaxonomyManager}
            </Link>
          </Button>
        }
        description={dictionary.admin.contentStructureDescription}
        title={dictionary.admin.contentStructure}
      >
        <div className="grid gap-8 p-5 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
              <FolderTree className="size-3.5" />
              {dictionary.admin.sections}
            </h3>
            <div className="mt-2 divide-y divide-border/50">
              {dashboard.sections.map((section) => (
                <Link
                  key={section.slug || "root"}
                  className="flex items-center justify-between gap-3 py-2.5 text-[13px] transition-colors hover:text-primary"
                  href={localizeHref(
                    lang,
                    `/admin/articles?section=${encodeURIComponent(section.slug)}`,
                  )}
                >
                  <span className="truncate">
                    {section.slug ? section.label : dictionary.common.root}
                  </span>
                  <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
                    {formatNumber(lang, section.totalArticles)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-medium text-muted-foreground">
              {dictionary.admin.tagsTitle}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dashboard.tags.map((tag) => (
                <Link
                  key={tag.tag}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11.5px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                  href={localizeHref(
                    lang,
                    `/admin/articles?tag=${encodeURIComponent(tag.tag)}`,
                  )}
                >
                  {tag.tag}
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(lang, tag.totalArticles)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </Page>
  );
}
