import { CommentStatus } from "@/generated/prisma/enums";
import { approveCommentAction, rejectCommentAction } from "@/app/actions/admin";
import { listCommentsForModeration } from "@/lib/comments";
import { buildWikiHref } from "@/lib/wiki-path";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const moderationFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: CommentStatus.PENDING },
  { label: "Approved", value: CommentStatus.APPROVED },
  { label: "Rejected", value: CommentStatus.REJECTED },
];

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
          <p className="eyebrow">Comments</p>
          <h2 className="text-2xl font-semibold">Moderate community feedback</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {moderationFilters.map((filter) => {
            const href = filter.value ? `/admin/comments?status=${filter.value}` : "/admin/comments";
            const active = currentStatus === filter.value || (!currentStatus && !filter.value);
            return (
              <a
                key={filter.label}
                className={active ? "button-primary" : "button-secondary"}
                href={href}
              >
                {filter.label}
              </a>
            );
          })}
        </div>
      </div>
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No comments matched this filter.
          </div>
        ) : null}
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-3xl border border-border/70 bg-white/70 p-5 shadow-sm shadow-slate-200/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="text-xs text-muted-foreground">{comment.author.email}</span>
                  <span className={comment.status === CommentStatus.APPROVED ? "status-pill status-pill-success" : comment.status === CommentStatus.REJECTED ? "status-pill status-pill-danger" : "status-pill"}>
                    {comment.status.toLowerCase()}
                  </span>
                </div>
                <p className="text-sm leading-7 whitespace-pre-wrap">{comment.body}</p>
                <div className="text-xs text-muted-foreground">
                  On <a className="text-primary hover:underline" href={buildWikiHref(comment.article.path)}>{comment.article.title}</a> · {comment.createdAt.toLocaleString()}
                </div>
                {comment.approver ? (
                  <div className="text-xs text-muted-foreground">
                    Moderated by {comment.approver.name} · {comment.approvedAt?.toLocaleString()}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <form action={approveCommentAction.bind(null, comment.id)}>
                  <button className="button-primary" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectCommentAction.bind(null, comment.id)}>
                  <button className="button-secondary" type="submit">
                    Reject
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
