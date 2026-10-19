import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileDiff,
  History,
} from "lucide-react";
import { restoreArticleRevisionAction } from "@/app/actions/admin";
import { RestoreRevisionForm } from "@/components/admin/restore-revision-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getArticleById } from "@/lib/articles";
import { getArticleRevisionDetail } from "@/lib/articles/revisions";
import { diffArticleMarkdown } from "@/lib/articles/revision-diff";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Params = Promise<{ lang: string; id: string; revisionId: string }>;

export default async function ArticleRevisionDiffPage({
  params,
}: {
  params: Params;
}) {
  const { lang, id, revisionId } = await params;

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

  const detail = await getArticleRevisionDetail(id, revisionId);

  if (!detail) {
    notFound();
  }

  const { revision, previous, next, version } = detail;
  const labels = dictionary.admin.revisionHistory;
  const diff = diffArticleMarkdown(previous?.markdown ?? "", revision.markdown);
  const changedLines = diff.stats.additions + diff.stats.deletions;
  const titleChanged = Boolean(previous && previous.title !== revision.title);
  const historyHref = localizeHref(
    lang,
    `/admin/articles/${article.id}/history`,
  );
  const editorHref = localizeHref(lang, `/admin/articles/${article.id}`);
  const compareFrom = previous
    ? formatTemplate(labels.version, { version: String(version - 1) })
    : labels.firstRevision;
  const compareTo = formatTemplate(labels.version, { version: String(version) });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 md:pt-6">
      <section className="surface-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">{labels.eyebrow}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {labels.diffTitle}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {labels.diffDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-mono text-[10px]" variant="outline">
                {compareFrom}
              </Badge>
              <span className="text-xs text-muted-foreground">→</span>
              <Badge className="font-mono text-[10px]" variant="secondary">
                {compareTo}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {revision.author.name || revision.author.email} ·{" "}
                {formatDateTime(lang, revision.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link href={historyHref}>
                <History className="size-3.5" />
                {labels.backToHistory}
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link href={editorHref}>
                <ArrowLeft className="size-3.5" />
                {labels.backToArticle}
              </Link>
            </Button>
            {previous ? (
              <Button asChild size="icon-sm" variant="ghost">
                <Link
                  href={localizeHref(
                    lang,
                    `/admin/articles/${article.id}/history/${previous.id}`,
                  )}
                  title={labels.olderVersion}
                >
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button asChild size="icon-sm" variant="ghost">
                <Link
                  href={localizeHref(
                    lang,
                    `/admin/articles/${article.id}/history/${next.id}`,
                  )}
                  title={labels.newerVersion}
                >
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            <RestoreRevisionForm
              action={restoreArticleRevisionAction.bind(null, article.id, lang)}
              className="max-w-64"
              label={labels.restore}
              revisionId={revision.id}
              variant="default"
            />
          </div>
        </div>
      </section>

      {titleChanged && previous ? (
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="text-base">{labels.titleChanged}</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">
                {formatTemplate(labels.titleFrom, { title: previous.title })}
              </span>
              <span className="block text-foreground">
                {formatTemplate(labels.titleTo, { title: revision.title })}
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="admin-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <FileDiff className="size-5 text-primary" />
                {labels.diffSection}
              </CardTitle>
              <CardDescription>
                {formatTemplate(labels.comparing, {
                  from: compareFrom,
                  to: compareTo,
                })}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                variant="outline"
              >
                {formatTemplate(labels.additions, {
                  count: String(diff.stats.additions),
                })}
              </Badge>
              <Badge
                className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-700 dark:text-rose-300"
                variant="outline"
              >
                {formatTemplate(labels.deletions, {
                  count: String(diff.stats.deletions),
                })}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {changedLines === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-sm text-muted-foreground">
              {labels.noChanges}
            </div>
          ) : (
            <div className="overflow-x-auto border-t font-mono text-xs leading-6">
              {diff.hunks.map((hunk, hunkIndex) => (
                <div
                  className="border-b border-border/40 last:border-b-0"
                  key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}
                >
                  <div className="border-y border-border/30 bg-muted/60 px-4 py-1 text-[11px] text-muted-foreground">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
                    {hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line, lineIndex) => (
                    <div
                      className={cn(
                        "grid grid-cols-[3.25rem_3.25rem_1.5rem_minmax(0,1fr)]",
                        line.type === "add" &&
                          "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
                        line.type === "remove" &&
                          "bg-rose-500/10 text-rose-900 dark:text-rose-100",
                        line.type === "context" && "text-muted-foreground",
                      )}
                      key={`${hunkIndex}-${lineIndex}`}
                    >
                      <span className="select-none border-r border-border/20 px-2 text-right text-[10px] text-muted-foreground/60">
                        {line.oldLineNumber ?? ""}
                      </span>
                      <span className="select-none border-r border-border/20 px-2 text-right text-[10px] text-muted-foreground/60">
                        {line.newLineNumber ?? ""}
                      </span>
                      <span className="select-none text-center">
                        {line.type === "add"
                          ? "+"
                          : line.type === "remove"
                            ? "-"
                            : " "}
                      </span>
                      <span className="whitespace-pre-wrap break-words pr-4">
                        {line.text === "" ? "\u00A0" : line.text}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
