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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="space-y-6 p-4 md:p-8 md:pt-6">
      <section className="surface-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">{dictionary.admin.commentsEyebrow}</p>
            <h2 className="text-3xl font-semibold tracking-tight">{dictionary.admin.moderateFeedback}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {moderationFilters.map((filter) => {
              const href = filter.value
                ? localizeHref(lang, `/admin/comments?status=${filter.value}`)
                : localizeHref(lang, "/admin/comments");
              const active = currentStatus === filter.value || (!currentStatus && !filter.value);

              return (
                <Button
                  key={filter.label}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  asChild
                  className="rounded-full"
                >
                  <Link href={href}>{filter.label}</Link>
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      <Card className="admin-card">
        <CardContent className="p-0">
          {comments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {dictionary.admin.noCommentsForFilter}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 w-[200px]">{dictionary.common.author}</TableHead>
                  <TableHead>{dictionary.common.comments}</TableHead>
                  <TableHead>{dictionary.common.articles}</TableHead>
                  <TableHead>{dictionary.common.status}</TableHead>
                  <TableHead className="pr-6 text-right">{dictionary.common.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comments.map((comment) => (
                  <TableRow key={comment.id}>
                    <TableCell className="pl-6 align-top py-4">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{comment.author.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {comment.author.email}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(lang, comment.createdAt)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-4 min-w-[300px]">
                      <div className="space-y-2">
                        <p className="text-sm leading-6 whitespace-pre-wrap">{comment.body}</p>
                        {comment.approver ? (
                          <p className="text-[10px] text-muted-foreground italic">
                            {formatTemplate(dictionary.admin.moderatedBy, {
                              name: comment.approver.name,
                              date: comment.approvedAt ? formatDateTime(lang, comment.approvedAt) : "",
                            })}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-4">
                      <Link
                        className="text-xs text-primary hover:underline font-medium block max-w-[200px] truncate"
                        href={buildWikiHref(comment.article.path, lang)}
                      >
                        {comment.article.title}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top py-4">
                      <Badge variant={comment.status === CommentStatus.APPROVED ? "default" : comment.status === CommentStatus.REJECTED ? "destructive" : "secondary"}>
                        {getCommentStatusLabel(comment.status, dictionary)}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right align-top py-4">
                      <div className="flex justify-end gap-2">
                        <form action={approveCommentAction.bind(null, lang, comment.id)}>
                          <Button size="sm" type="submit" variant="ghost" disabled={comment.status === CommentStatus.APPROVED}>
                            {dictionary.admin.approve}
                          </Button>
                        </form>
                        <form action={rejectCommentAction.bind(null, lang, comment.id)}>
                          <Button size="sm" type="submit" variant="ghost" disabled={comment.status === CommentStatus.REJECTED}>
                            {dictionary.admin.reject}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
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
