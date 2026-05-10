import Link from "next/link";
import { CommentStatus } from "@/generated/prisma/enums";
import { approveCommentAction, rejectCommentAction } from "@/app/actions/admin";
import { listCommentsForModeration } from "@/lib/comments";
import { buildWikiHref } from "@/lib/wiki/path";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { requireRootSession } from "@/lib/auth/session";

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
    <section className="surface-panel space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">{dictionary.admin.commentsEyebrow}</p>
          <h2 className="text-2xl font-semibold">{dictionary.admin.moderateFeedback}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {moderationFilters.map((filter) => {
            const href = filter.value
              ? localizeHref(lang, `/admin/comments?status=${filter.value}`)
              : localizeHref(lang, "/admin/comments");
            const active = currentStatus === filter.value || (!currentStatus && !filter.value);

            return (
              <Link
                key={filter.label}
                className={active ? "button-primary" : "button-secondary"}
                href={href}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {dictionary.admin.noCommentsForFilter}
          </div>
        ) : null}
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-3xl border border-border/70 bg-white/70 dark:bg-zinc-900/40 p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="text-xs text-muted-foreground">{comment.author.email}</span>
                  <span className={comment.status === CommentStatus.APPROVED ? "status-pill status-pill-success" : comment.status === CommentStatus.REJECTED ? "status-pill status-pill-danger" : "status-pill"}>
                    {getCommentStatusLabel(comment.status, dictionary)}
                  </span>
                </div>
                <p className="text-sm leading-7 whitespace-pre-wrap">{comment.body}</p>
                <div className="text-xs text-muted-foreground">
                  {dictionary.metadata.wiki} ·{" "}
                  <Link className="text-primary hover:underline" href={buildWikiHref(comment.article.path, lang)}>
                    {comment.article.title}
                  </Link>
                  {" · "}
                  {formatDateTime(lang, comment.createdAt)}
                </div>
                {comment.approver ? (
                  <div className="text-xs text-muted-foreground">
                    {formatTemplate(dictionary.admin.moderatedBy, {
                      name: comment.approver.name,
                      date: comment.approvedAt ? formatDateTime(lang, comment.approvedAt) : "",
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <form action={approveCommentAction.bind(null, lang, comment.id)}>
                  <button className="button-primary" type="submit">
                    {dictionary.admin.approve}
                  </button>
                </form>
                <form action={rejectCommentAction.bind(null, lang, comment.id)}>
                  <button className="button-secondary" type="submit">
                    {dictionary.admin.reject}
                  </button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
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
