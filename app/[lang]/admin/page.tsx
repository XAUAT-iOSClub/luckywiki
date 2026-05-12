import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesColumn,
  FileText,
  FolderTree,
  MessageSquare,
  Tags,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleStatus } from "@/generated/prisma/enums";
import { getAdminDashboardData } from "@/lib/admin";
import { buildWikiHref } from "@/lib/wiki/path";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { requireRootSession } from "@/lib/auth/session";

type Params = Promise<{ lang: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Admin",
    robots: { index: false, follow: false },
  };
}

export default async function AdminHomePage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [dashboard, dictionary] = await Promise.all([
    getAdminDashboardData(),
    getDictionary(lang),
  ]);

  const quickLinks = [
    {
      title: dictionary.admin.quickLinks.articlesTitle,
      description: dictionary.admin.quickLinks.articlesDescription,
      href: localizeHref(lang, "/admin/articles"),
      icon: FileText,
    },
    {
      title: dictionary.admin.quickLinks.commentsTitle,
      description: dictionary.admin.quickLinks.commentsDescription,
      href: localizeHref(lang, "/admin/comments?status=PENDING"),
      icon: MessageSquare,
    },
    {
      title: dictionary.admin.quickLinks.taxonomyTitle,
      description: dictionary.admin.quickLinks.taxonomyDescription,
      href: localizeHref(lang, "/admin/taxonomy"),
      icon: FolderTree,
    },
    {
      title: dictionary.admin.quickLinks.contributorsTitle,
      description: dictionary.admin.quickLinks.contributorsDescription,
      href: localizeHref(lang, "/admin/users"),
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">{dictionary.admin.operationsCenter}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {dictionary.admin.dashboardTitle}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {dictionary.admin.dashboardDescription}
              </p>
            </div>
          </div>
          <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[1.75rem] border border-border/60 bg-background/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <link.icon className="size-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{link.title}</span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail={formatTemplate(dictionary.admin.metrics.articlesDetail, {
            published: formatNumber(lang, dashboard.totals.publishedArticles),
            drafts: formatNumber(lang, dashboard.totals.draftArticles),
          })}
          title={dictionary.admin.metrics.articles}
          value={dashboard.totals.articles}
        />
        <MetricCard
          detail={formatTemplate(dictionary.admin.metrics.moderationDetail, {
            approved: formatNumber(lang, dashboard.totals.approvedComments),
            rejected: formatNumber(lang, dashboard.totals.rejectedComments),
          })}
          title={dictionary.admin.metrics.moderation}
          value={dashboard.totals.pendingComments}
        />
        <MetricCard
          detail={formatTemplate(dictionary.admin.metrics.structureDetail, {
            tags: formatNumber(lang, dashboard.totals.tags),
          })}
          title={dictionary.admin.metrics.structure}
          value={dashboard.totals.sections}
        />
        <MetricCard
          detail={formatTemplate(dictionary.admin.metrics.contributorsDetail, {
            verified: formatNumber(lang, dashboard.totals.verifiedUsers),
            authors: formatNumber(lang, dashboard.totals.authorUsers),
            admins: formatNumber(lang, dashboard.totals.rootUsers),
          })}
          title={dictionary.admin.metrics.contributors}
          value={dashboard.totals.users}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle>{dictionary.admin.recentlyUpdated}</CardTitle>
            <CardDescription>{dictionary.admin.recentlyUpdatedDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {dashboard.recentArticles.map((article) => (
              <div
                key={article.id}
                className="flex flex-col gap-3 rounded-[1.5rem] border border-border/60 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={localizeHref(lang, `/admin/articles/${article.id}`)}
                      className="font-medium hover:text-primary"
                    >
                      {article.title}
                    </Link>
                    <Badge
                      variant={article.status === ArticleStatus.PUBLISHED ? "default" : "secondary"}
                    >
                      {article.status === ArticleStatus.PUBLISHED
                        ? dictionary.common.published
                        : dictionary.common.draft}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">/{article.path || ""}</p>
                  <p className="text-sm text-muted-foreground">
                    {article.author.name} · {formatDateTime(lang, article.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {article.tags.slice(0, 3).map((tag) => (
                    <Link
                      key={tag}
                      href={localizeHref(lang, `/admin/articles?tag=${encodeURIComponent(tag)}`)}
                    >
                      <Badge variant="secondary">{tag}</Badge>
                    </Link>
                  ))}
                  {article.status === ArticleStatus.PUBLISHED ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={buildWikiHref(article.path, lang)} target="_blank">
                        {dictionary.common.viewLive}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
            <CardHeader>
              <CardTitle>{dictionary.admin.pendingComments}</CardTitle>
              <CardDescription>{dictionary.admin.pendingCommentsDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dashboard.pendingComments.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {dictionary.admin.noPendingComments}
                </p>
              ) : (
                dashboard.pendingComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-[1.5rem] border border-border/60 bg-muted/20 p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary">{comment.author.name}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(lang, comment.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-6">{comment.body}</p>
                    <Link
                      href={localizeHref(lang, "/admin/comments?status=PENDING")}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"
                    >
                      {formatTemplate(dictionary.admin.reviewOn, {
                        title: comment.article.title,
                      })}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
            <CardHeader>
              <CardTitle>{dictionary.admin.contentStructure}</CardTitle>
              <CardDescription>{dictionary.admin.contentStructureDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ChartNoAxesColumn className="size-4 text-primary" />
                  {dictionary.admin.sections}
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboard.sections.map((section) => (
                    <Link
                      key={section.slug || "root"}
                      href={localizeHref(
                        lang,
                        `/admin/articles?section=${encodeURIComponent(section.slug)}`,
                      )}
                    >
                      <Badge variant="secondary">
                        {(section.slug ? section.label : dictionary.common.root)} · {formatNumber(lang, section.totalArticles)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tags className="size-4 text-primary" />
                  {dictionary.admin.tagsTitle}
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboard.tags.map((tag) => (
                    <Link
                      key={tag.tag}
                      href={localizeHref(lang, `/admin/articles?tag=${encodeURIComponent(tag.tag)}`)}
                    >
                      <Badge variant="secondary">
                        {tag.tag} · {formatNumber(lang, tag.totalArticles)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link href={localizeHref(lang, "/admin/taxonomy")}>
                  {dictionary.admin.openTaxonomyManager}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: number;
}) {
  return (
    <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
