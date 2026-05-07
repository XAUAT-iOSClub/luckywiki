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
import { buildWikiHref } from "@/lib/wiki-path";
import { getAdminDashboardData } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const quickLinks = [
  {
    title: "Article Library",
    description: "Search, filter, and update every article in one place.",
    href: "/admin/articles",
    icon: FileText,
  },
  {
    title: "Comment Queue",
    description: "Review pending feedback and keep discussions healthy.",
    href: "/admin/comments?status=PENDING",
    icon: MessageSquare,
  },
  {
    title: "Taxonomy",
    description: "Manage sections, tags, and content structure.",
    href: "/admin/taxonomy",
    icon: FolderTree,
  },
  {
    title: "Contributors",
    description: "See who is publishing, commenting, and moderating.",
    href: "/admin/users",
    icon: Users,
  },
];

export default async function AdminHomePage() {
  const dashboard = await getAdminDashboardData();

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">Operations Center</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Keep your wiki organized, reviewed, and ready to publish.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Admin now covers content health, structure, metadata, contributors,
                and moderation instead of just two isolated lists.
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
          title="Articles"
          value={dashboard.totals.articles}
          detail={`${dashboard.totals.publishedArticles} published · ${dashboard.totals.draftArticles} drafts`}
          icon={FileText}
        />
        <MetricCard
          title="Moderation"
          value={dashboard.totals.pendingComments}
          detail={`${dashboard.totals.approvedComments} approved · ${dashboard.totals.rejectedComments} rejected`}
          icon={MessageSquare}
        />
        <MetricCard
          title="Structure"
          value={dashboard.totals.sections}
          detail={`${dashboard.totals.tags} tags in active use`}
          icon={FolderTree}
        />
        <MetricCard
          title="Contributors"
          value={dashboard.totals.users}
          detail={`${dashboard.totals.verifiedUsers} verified · ${dashboard.totals.rootUsers} admins`}
          icon={Users}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle>Recently updated content</CardTitle>
            <CardDescription>
              The latest articles moving through your publishing workflow.
            </CardDescription>
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
                      href={`/admin/articles/${article.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {article.title}
                    </Link>
                    <Badge
                      variant={
                        article.status === "PUBLISHED" ? "default" : "secondary"
                      }
                    >
                      {article.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    /{article.path || ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {article.author.name} · {article.updatedAt.toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {article.tags.slice(0, 3).map((tag) => (
                    <Link key={tag} href={`/admin/articles?tag=${encodeURIComponent(tag)}`}>
                      <Badge variant="secondary">{tag}</Badge>
                    </Link>
                  ))}
                  {article.status === "PUBLISHED" ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={buildWikiHref(article.path)} target="_blank">
                        View live
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
              <CardTitle>Pending comments</CardTitle>
              <CardDescription>
                Keep moderation moving so contributors get timely feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dashboard.pendingComments.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No pending comments right now.
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
                        {comment.createdAt.toLocaleString()}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-6">
                      {comment.body}
                    </p>
                    <Link
                      href={`/admin/comments?status=PENDING`}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"
                    >
                      Review on {comment.article.title}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
            <CardHeader>
              <CardTitle>Content structure</CardTitle>
              <CardDescription>
                Top sections and tags with the heaviest editorial activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ChartNoAxesColumn className="size-4 text-primary" />
                  Sections
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboard.sections.map((section) => (
                    <Link
                      key={section.slug || "root"}
                      href={`/admin/articles?section=${encodeURIComponent(section.slug)}`}
                    >
                      <Badge variant="secondary">
                        {section.label} · {section.totalArticles}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tags className="size-4 text-primary" />
                  Tags
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboard.tags.map((tag) => (
                    <Link
                      key={tag.tag}
                      href={`/admin/articles?tag=${encodeURIComponent(tag.tag)}`}
                    >
                      <Badge variant="secondary">
                        {tag.tag} · {tag.totalArticles}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link href="/admin/taxonomy">Open taxonomy manager</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof FileText;
}) {
  return (
    <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
        </div>
        <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
