import Link from "next/link";
import { ScrollText } from "lucide-react";
import { LogAction } from "@/generated/prisma/enums";
import type { LogModel } from "@/generated/prisma/models/Log";
import { listAdminLogs, listAdminUsers } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";
import { notFound } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export default async function AdminLogsPage({
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
  const [dictionary, users] = await Promise.all([
    getDictionary(lang),
    listAdminUsers(),
  ]);

  const paramsObject = await searchParams;
  const currentPage = Math.max(Number(getSingleParam(paramsObject, "page")) || 1, 1);
  const actionValue = getSingleParam(paramsObject, "action")?.trim() ?? "";
  const userId = getSingleParam(paramsObject, "userId")?.trim() ?? "";
  const action = Object.values(LogAction).includes(actionValue as LogAction)
    ? (actionValue as LogAction)
    : undefined;
  const pageSize = 20;

  const { logs, totalCount, totalPages } = await listAdminLogs({
    page: currentPage,
    pageSize,
    action,
    userId,
  });

  const actionOptions = Object.values(LogAction);
  const userOptions = users.map((u) => ({
    id: u.id,
    name: u.name || u.email,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <p className="eyebrow">{dictionary.admin.logsEyebrow}</p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{dictionary.admin.logsTitle}</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
            {dictionary.admin.logsDescription}
          </p>
        </div>
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-5 text-primary" />
            {dictionary.common.logs}
          </CardTitle>
          <CardDescription>{dictionary.admin.logsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[repeat(2,minmax(0,1fr))_auto]">
            <label className="field-block">
              <span>{dictionary.common.action}</span>
              <select className="field-input" defaultValue={action ?? ""} name="action">
                <option value="">{dictionary.common.allActions}</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {dictionary.admin.logActions[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>{dictionary.common.user}</span>
              <select className="field-input" defaultValue={userId} name="userId">
                <option value="">{dictionary.common.allUsers}</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-3">
              <Button type="submit">{dictionary.common.apply}</Button>
              {action || userId ? (
                <Button variant="outline" asChild>
                  <Link href={localizeHref(lang, "/admin/logs")}>{dictionary.common.reset}</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle>{dictionary.common.logs}</CardTitle>
          <CardDescription>
            {totalCount === 0
              ? dictionary.admin.noLogsFound
              : formatTemplate(dictionary.admin.showingPage, {
                  current: String(currentPage),
                  total: String(Math.max(totalPages, 1)),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border-t border-dashed">
              {dictionary.admin.noLogsFound}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{dictionary.common.time}</TableHead>
                  <TableHead>{dictionary.common.user}</TableHead>
                  <TableHead>{dictionary.common.action}</TableHead>
                  <TableHead>{dictionary.common.target}</TableHead>
                  <TableHead className="pr-6">{dictionary.common.detail}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <LogRow
                    key={log.id}
                    lang={lang}
                    log={log}
                    dictionary={dictionary}
                  />
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 ? (
            <div className="p-4 border-t">
              <Pagination className="justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={
                        currentPage > 1
                          ? buildLogsHref(lang, { action, userId, page: currentPage - 1 })
                          : "#"
                      }
                      className={currentPage === 1 ? "pointer-events-none opacity-40" : ""}
                    />
                  </PaginationItem>
                  {buildPageNumbers(currentPage, totalPages).map((pageNumber, index) =>
                    pageNumber === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          href={buildLogsHref(lang, { action, userId, page: pageNumber })}
                          isActive={pageNumber === currentPage}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href={
                        currentPage < totalPages
                          ? buildLogsHref(lang, { action, userId, page: currentPage + 1 })
                          : "#"
                      }
                      className={currentPage === totalPages ? "pointer-events-none opacity-40" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function LogRow({
  lang,
  log,
  dictionary,
}: {
  lang: Locale;
  log: LogModel & { user: { id: string; name: string; email: string } };
  dictionary: Awaited<ReturnType<typeof getDictionary>>;
}) {
  const actionLabel = dictionary.admin.logActions[log.action as keyof typeof dictionary.admin.logActions] ?? log.action;
  const targetLabel = dictionary.admin.logTargetTypes[log.targetType as keyof typeof dictionary.admin.logTargetTypes] ?? log.targetType;
  const detailSummary = parseDetail(log.detail, dictionary);

  return (
    <TableRow>
      <TableCell className="pl-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(lang, log.createdAt)}
      </TableCell>
      <TableCell>
        <div className="text-xs space-y-0.5">
          <p className="font-medium">{log.user.name}</p>
          <p className="text-muted-foreground">{log.user.email}</p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getActionBadgeVariant(log.action)} className="text-[11px]">
          {actionLabel}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {targetLabel}
          </Badge>
          {log.targetType === "Article" ? (
            <Link
              href={localizeHref(lang, `/admin/articles/${log.targetId}`)}
              className="font-mono text-xs text-muted-foreground hover:text-primary truncate max-w-[120px]"
            >
              {log.targetId}
            </Link>
          ) : (
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">
              {log.targetId}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="pr-6">
        <span className="text-xs text-muted-foreground">{detailSummary}</span>
      </TableCell>
    </TableRow>
  );
}

function parseDetail(
  detail: string | null,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
): string {
  if (!detail) return "-";
  try {
    const parsed = JSON.parse(detail);
    const parts: string[] = [];

    if (parsed.title) parts.push(`${dictionary.admin.logDetail.title}: ${parsed.title}`);
    if (parsed.path) parts.push(`${dictionary.admin.logDetail.path}: ${parsed.path}`);
    if (parsed.status) parts.push(`${dictionary.admin.logDetail.status}: ${parsed.status}`);
    if (parsed.oldPath) parts.push(`old path: ${parsed.oldPath}`);
    if (parsed.articlePath) parts.push(`${dictionary.admin.logDetail.articlePath}: ${parsed.articlePath}`);

    if (parsed.oldStatus && parsed.newStatus) {
      parts.push(
        `${formatTemplate(dictionary.admin.logDetail.oldStatus, { old: parsed.oldStatus })} ${formatTemplate(dictionary.admin.logDetail.newStatus, { new: parsed.newStatus })}`,
      );
    }
    if (parsed.oldRole && parsed.newRole) {
      parts.push(
        `${formatTemplate(dictionary.admin.logDetail.oldRole, { old: parsed.oldRole })} ${formatTemplate(dictionary.admin.logDetail.newRole, { new: parsed.newRole })}`,
      );
    }

    return parts.join(" · ") || "-";
  } catch {
    return detail;
  }
}

function getSingleParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildLogsHref(
  locale: Locale,
  {
    action,
    userId,
    page,
  }: {
    action?: LogAction;
    userId?: string;
    page?: number;
  },
) {
  const nextSearchParams = new URLSearchParams();
  if (action) nextSearchParams.set("action", action);
  if (userId) nextSearchParams.set("userId", userId);
  if (page && page > 1) nextSearchParams.set("page", String(page));

  const search = nextSearchParams.toString();
  return search
    ? localizeHref(locale, `/admin/logs?${search}`)
    : localizeHref(locale, "/admin/logs");
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }
  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }
  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

function getActionBadgeVariant(action: LogAction) {
  switch (action) {
    case LogAction.CREATE_ARTICLE:
      return "default";
    case LogAction.UPDATE_ARTICLE:
      return "secondary";
    case LogAction.DELETE_ARTICLE:
      return "destructive";
    case LogAction.APPROVE_COMMENT:
      return "default";
    case LogAction.REJECT_COMMENT:
      return "destructive";
    case LogAction.SET_ARTICLE_STATUS:
      return "secondary";
    case LogAction.SET_USER_ROLE:
      return "secondary";
  }
}
