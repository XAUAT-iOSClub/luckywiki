import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MessageSquare } from "lucide-react";
import { CommentStatus } from "@/generated/prisma/enums";
import { approveCommentAction, rejectCommentAction } from "@/app/actions/admin";
import { listCommentsForModeration } from "@/lib/comments";
import { buildWikiHref } from "@/lib/wiki/path";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  Panel,
  StatusDot,
  type StatusTone,
} from "@/components/ui/page-ui";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export default async function AdminCommentsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const dictionary = await getDictionary(lang);
  const moderationFilters = [
    { label: dictionary.common.all, value: "" },
    { label: dictionary.common.pending, value: CommentStatus.PENDING },
    { label: dictionary.common.approved, value: CommentStatus.APPROVED },
    { label: dictionary.common.rejected, value: CommentStatus.REJECTED },
  ];
  const currentStatus = getSingleSearchParam(await searchParams, "status");
  const comments = await listCommentsForModeration(
    currentStatus && Object.values(CommentStatus).includes(currentStatus as CommentStatus)
      ? (currentStatus as CommentStatus)
      : undefined,
  );

  return (
    <Page>
      <PageHeader
        description={dictionary.admin.moderateFeedback}
        title={dictionary.common.comments}
      />

      <Panel
        action={
          <nav
            aria-label={dictionary.common.status}
            className="inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
          >
            {moderationFilters.map((filter) => {
              const href = filter.value
                ? localizeHref(lang, `/admin/comments?status=${filter.value}`)
                : localizeHref(lang, "/admin/comments");
              const active =
                currentStatus === filter.value || (!currentStatus && !filter.value);

              return (
                <Link
                  key={filter.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1 text-[12px] transition-colors",
                    active
                      ? "bg-card font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  href={href}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>
        }
        description={dictionary.admin.moderateFeedback}
        title={dictionary.common.comments}
      >
        {comments.length === 0 ? (
          <EmptyState
            description={dictionary.admin.noCommentsForFilter}
            icon={MessageSquare}
            title={dictionary.admin.noCommentsForFilter}
          />
        ) : (
          <List>
            {comments.map((comment) => (
              <ListRow key={comment.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Avatar className="size-8 shrink-0 rounded-md">
                      <AvatarImage
                        alt={comment.author.name}
                        src={comment.author.image || ""}
                      />
                      <AvatarFallback className="rounded-md text-[11px]">
                        {comment.author.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[12.5px] font-medium text-foreground">
                          {comment.author.name}
                        </p>
                        <StatusDot
                          tone={getCommentStatusTone(comment.status)}
                        >
                          {getCommentStatusLabel(comment.status, dictionary)}
                        </StatusDot>
                        <span className="text-[11.5px] text-muted-foreground">
                          {formatDateTime(lang, comment.createdAt)}
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-[13.5px] leading-6 text-foreground/85">
                        {comment.body}
                      </p>

                      <Link
                        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        href={buildWikiHref(comment.article.path, lang)}
                      >
                        <FileText className="size-3" />
                        {comment.article.title}
                      </Link>

                      {comment.approver ? (
                        <p className="text-[11.5px] text-muted-foreground">
                          {formatTemplate(dictionary.admin.moderatedBy, {
                            name: comment.approver.name,
                            date: comment.approvedAt
                              ? formatDateTime(lang, comment.approvedAt)
                              : "",
                          })}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 lg:pl-4">
                    <form
                      action={approveCommentAction.bind(null, lang, comment.id)}
                    >
                      <Button
                        disabled={comment.status === CommentStatus.APPROVED}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        {dictionary.admin.approve}
                      </Button>
                    </form>
                    <form
                      action={rejectCommentAction.bind(null, lang, comment.id)}
                    >
                      <Button
                        disabled={comment.status === CommentStatus.REJECTED}
                        size="sm"
                        type="submit"
                        variant="ghost"
                      >
                        {dictionary.admin.reject}
                      </Button>
                    </form>
                  </div>
                </div>
              </ListRow>
            ))}
          </List>
        )}
      </Panel>
    </Page>
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getCommentStatusTone(status: CommentStatus): StatusTone {
  switch (status) {
    case CommentStatus.APPROVED:
      return "success";
    case CommentStatus.REJECTED:
      return "danger";
    default:
      return "warning";
  }
}

function getCommentStatusLabel(
  status: CommentStatus,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  switch (status) {
    case CommentStatus.APPROVED:
      return dictionary.common.approved;
    case CommentStatus.REJECTED:
      return dictionary.common.rejected;
    default:
      return dictionary.common.pending;
  }
}
