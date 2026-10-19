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
  AdminEmpty,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-ui";
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
    <AdminPage>
      <AdminPageHeader
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button asChild size="sm" variant="outline">
              <Link href={historyHref}>
                <History data-icon="inline-start" />
                {labels.backToHistory}
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={editorHref}>
                <ArrowLeft data-icon="inline-start" />
                {labels.backToArticle}
              </Link>
            </Button>
            {previous ? (
              <Button asChild size="icon-sm" variant="ghost">
                <Link
                  aria-label={labels.olderVersion}
                  href={localizeHref(
                    lang,
                    `/admin/articles/${article.id}/history/${previous.id}`,
                  )}
                  title={labels.olderVersion}
                >
                  <ChevronLeft />
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button asChild size="icon-sm" variant="ghost">
                <Link
                  aria-label={labels.newerVersion}
                  href={localizeHref(
                    lang,
                    `/admin/articles/${article.id}/history/${next.id}`,
                  )}
                  title={labels.newerVersion}
                >
                  <ChevronRight />
                </Link>
              </Button>
            ) : null}
            <RestoreRevisionForm
              action={restoreArticleRevisionAction.bind(
                null,
                article.id,
                lang,
              )}
              label={labels.restore}
              revisionId={revision.id}
              size="sm"
              variant="default"
            />
          </div>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{labels.diffDescription}</span>
            <span className="inline-flex items-center gap-1.5">
              <Badge className="font-mono" variant="outline">
                {compareFrom}
              </Badge>
              <span className="text-muted-foreground">→</span>
              <Badge className="font-mono" variant="secondary">
                {compareTo}
              </Badge>
            </span>
            <span className="text-muted-foreground/80">
              {revision.author.name || revision.author.email}
              <span className="px-1.5 text-border">·</span>
              {formatDateTime(lang, revision.createdAt)}
            </span>
          </span>
        }
        title={labels.diffTitle}
      />

      {titleChanged && previous ? (
        <AdminPanel title={labels.titleChanged}>
          <div className="space-y-1.5 p-5 text-[13px] leading-6">
            <p className="text-muted-foreground">
              {formatTemplate(labels.titleFrom, { title: previous.title })}
            </p>
            <p className="text-foreground">
              {formatTemplate(labels.titleTo, { title: revision.title })}
            </p>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel
        action={
          <div className="flex items-center gap-1.5">
            <Badge variant="success">
              {formatTemplate(labels.additions, {
                count: String(diff.stats.additions),
              })}
            </Badge>
            <Badge variant="destructive">
              {formatTemplate(labels.deletions, {
                count: String(diff.stats.deletions),
              })}
            </Badge>
          </div>
        }
        description={formatTemplate(labels.comparing, {
          from: compareFrom,
          to: compareTo,
        })}
        title={
          <span className="inline-flex items-center gap-2">
            <FileDiff className="size-4 text-muted-foreground" />
            {labels.diffSection}
          </span>
        }
      >
        {changedLines === 0 ? (
          <AdminEmpty
            description={labels.noChanges}
            icon={FileDiff}
            title={labels.noChanges}
          />
        ) : (
          <div className="overflow-x-auto font-mono text-[12px] leading-6">
            {diff.hunks.map((hunk, hunkIndex) => (
              <div
                className="border-b border-border/50 last:border-b-0"
                key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}
              >
                <div className="border-y border-border/40 bg-muted/40 px-4 py-1 text-[11px] text-muted-foreground">
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
                    <span className="select-none border-r border-border/30 px-2 text-right text-[10.5px] text-muted-foreground/60">
                      {line.oldLineNumber ?? ""}
                    </span>
                    <span className="select-none border-r border-border/30 px-2 text-right text-[10.5px] text-muted-foreground/60">
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
      </AdminPanel>
    </AdminPage>
  );
}
