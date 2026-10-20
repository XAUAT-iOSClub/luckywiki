import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { LogAction } from "@/generated/prisma/enums";
import type { LogModel } from "@/generated/prisma/models/Log";
import { listAdminLogs, listAdminUsers } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  Panel,
} from "@/components/ui/page-ui";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";

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
  const userOptions = users.map((user) => ({
    id: user.id,
    name: user.name || user.email,
  }));
  const pageLabel = formatTemplate(dictionary.admin.showingPage, {
    current: String(currentPage),
    total: String(Math.max(totalPages, 1)),
  });

  return (
    <Page>
      <PageHeader
        description={dictionary.admin.logsDescription}
        title={dictionary.common.logs}
      />

      <Panel
        description={
          totalCount === 0 ? dictionary.admin.noLogsFound : pageLabel
        }
        title={
          <span className="inline-flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            {dictionary.common.logs}
          </span>
        }
      >
        <form className="flex flex-col gap-2 border-b border-border/60 px-5 py-3 sm:flex-row sm:items-center">
          <select
            aria-label={dictionary.admin.filterByAction}
            className="select-native sm:w-44"
            defaultValue={action ?? ""}
            name="action"
          >
            <option value="">{dictionary.common.allActions}</option>
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {dictionary.admin.logActions[option]}
              </option>
            ))}
          </select>
          <select
            aria-label={dictionary.admin.filterByUser}
            className="select-native sm:w-52"
            defaultValue={userId}
            name="userId"
          >
            <option value="">{dictionary.common.allUsers}</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Button size="sm" type="submit">
              {dictionary.common.apply}
            </Button>
            {action || userId ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={localizeHref(lang, "/admin/logs")}>
                  {dictionary.common.reset}
                </Link>
              </Button>
            ) : null}
          </div>
        </form>

        {logs.length === 0 ? (
          <EmptyState
            description={dictionary.admin.noLogsFound}
            icon={ScrollText}
            title={dictionary.admin.noLogsFound}
          />
        ) : (
          <List>
            {logs.map((log) => (
              <ListRow key={log.id}>
                <LogRow
                  dictionary={dictionary}
                  lang={lang}
                  log={log}
                />
              </ListRow>
            ))}
          </List>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            <p className="text-[12px] text-muted-foreground">{pageLabel}</p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    className={
                      currentPage === 1 ? "pointer-events-none opacity-40" : ""
                    }
                    href={
                      currentPage > 1
                        ? buildLogsHref(lang, {
                            action,
                            userId,
                            page: currentPage - 1,
                          })
                        : "#"
                    }
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-40"
                        : ""
                    }
                    href={
                      currentPage < totalPages
                        ? buildLogsHref(lang, {
                            action,
                            userId,
                            page: currentPage + 1,
                          })
                        : "#"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </Panel>
    </Page>
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
  const actionLabel =
    dictionary.admin.logActions[
      log.action as keyof typeof dictionary.admin.logActions
    ] ?? log.action;
  const targetLabel =
    dictionary.admin.logTargetTypes[
      log.targetType as keyof typeof dictionary.admin.logTargetTypes
    ] ?? log.targetType;
  const detailSummary = parseDetail(log.detail, dictionary);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-[124px] shrink-0 font-mono text-[11.5px] text-muted-foreground">
          {formatDateTime(lang, log.createdAt)}
        </span>
        <Badge variant={getActionBadgeVariant(log.action)}>{actionLabel}</Badge>
        <span className="text-[12.5px] font-medium text-foreground">
          {log.user.name}
        </span>
        <span className="hidden truncate text-[11.5px] text-muted-foreground sm:inline">
          {log.user.email}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-0 text-[12px] text-muted-foreground sm:pl-[132px]">
        <span>{targetLabel}</span>
        {log.targetType === "Article" ? (
          <Link
            className="max-w-[220px] truncate font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            href={localizeHref(lang, `/admin/articles/${log.targetId}`)}
          >
            {log.targetId}
          </Link>
        ) : (
          <span className="max-w-[220px] truncate font-mono text-[11.5px]">
            {log.targetId}
          </span>
        )}
        {detailSummary !== "-" ? (
          <>
            <span className="text-border">·</span>
            <span className="min-w-0">{detailSummary}</span>
          </>
        ) : null}
      </div>
    </div>
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
    if (parsed.articlePath)
      parts.push(`${dictionary.admin.logDetail.articlePath}: ${parsed.articlePath}`);
    if (parsed.restoredFrom) parts.push(dictionary.admin.logDetail.restoredFrom);

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

function getActionBadgeVariant(action: LogAction) {
  switch (action) {
    case LogAction.CREATE_ARTICLE:
    case LogAction.RESTORE_ARTICLE:
    case LogAction.APPROVE_COMMENT:
      return "success" as const;
    case LogAction.DELETE_ARTICLE:
    case LogAction.DELETE_MEDIA:
    case LogAction.REJECT_COMMENT:
      return "destructive" as const;
    case LogAction.UPDATE_ARTICLE:
    case LogAction.SET_ARTICLE_STATUS:
    case LogAction.SET_USER_ROLE:
    case LogAction.CLEANUP_MEDIA:
      return "secondary" as const;
    default:
      return "secondary" as const;
  }
}
