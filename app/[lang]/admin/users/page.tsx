import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminEmpty,
  AdminList,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  StatusDot,
} from "@/components/admin/admin-ui";
import { listAdminUsers } from "@/lib/admin";
import { formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";
import { setUserRoleAction } from "@/app/actions/admin";

type Params = Promise<{ lang: string }>;

export default async function AdminUsersPage({ params }: { params: Params }) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [users, dictionary] = await Promise.all([
    listAdminUsers(),
    getDictionary(lang),
  ]);
  const rootCount = users.filter((user) => user.role === Role.ROOT).length;
  const authorCount = users.filter((user) => user.role === Role.AUTHOR).length;

  return (
    <AdminPage>
      <AdminPageHeader
        actions={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              {formatTemplate(dictionary.admin.totalUsers, {
                count: formatNumber(lang, users.length),
              })}
            </span>
            <span className="text-border">·</span>
            <span>
              {formatTemplate(dictionary.admin.authors, {
                count: formatNumber(lang, authorCount),
              })}
            </span>
            <span className="text-border">·</span>
            <span>
              {formatTemplate(dictionary.admin.admins, {
                count: formatNumber(lang, rootCount),
              })}
            </span>
          </div>
        }
        description={dictionary.admin.contributorsDescription}
        title={dictionary.common.contributors}
      />

      <AdminPanel
        description={dictionary.admin.peopleDirectoryDescription}
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            {dictionary.admin.peopleDirectory}
          </span>
        }
      >
        {users.length === 0 ? (
          <AdminEmpty icon={Users} title={dictionary.admin.noLogsFound} />
        ) : (
          <AdminList>
            {users.map((user) => (
              <AdminListRow key={user.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar className="size-9 shrink-0 rounded-md">
                      <AvatarImage alt={user.name} src={user.image || ""} />
                      <AvatarFallback className="rounded-md text-[11px]">
                        {user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[13.5px] font-medium text-foreground">
                          {user.name}
                        </p>
                        <Badge variant={roleBadgeVariant(user.role)}>
                          {getRoleLabel(user.role, dictionary)}
                        </Badge>
                        <StatusDot
                          tone={user.emailVerified ? "success" : "muted"}
                        >
                          {user.emailVerified
                            ? dictionary.common.verified
                            : dictionary.common.unverified}
                        </StatusDot>
                      </div>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground/85">
                        {formatNumber(lang, user._count.articles)}{" "}
                        {dictionary.common.articles}
                        <span className="px-1.5 text-border">·</span>
                        {formatNumber(lang, user._count.comments)}{" "}
                        {dictionary.common.comments}
                        <span className="px-1.5 text-border">·</span>
                        {formatNumber(lang, user._count.approvedComments)}{" "}
                        {dictionary.admin.moderated}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1 md:justify-end">
                    {roleTargets(user.role).map((targetRole) => {
                      const protectedLastAdmin =
                        user.role === Role.ROOT &&
                        rootCount <= 1 &&
                        targetRole !== Role.ROOT;

                      return (
                        <form
                          key={targetRole}
                          action={setUserRoleAction.bind(
                            null,
                            lang,
                            user.id,
                            targetRole,
                          )}
                        >
                          <Button
                            className="text-[11.5px] text-muted-foreground hover:text-foreground"
                            disabled={protectedLastAdmin}
                            size="sm"
                            title={
                              protectedLastAdmin
                                ? dictionary.admin.protectedLastAdmin
                                : undefined
                            }
                            type="submit"
                            variant="ghost"
                          >
                            {getRoleActionLabel(targetRole, dictionary)}
                          </Button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              </AdminListRow>
            ))}
          </AdminList>
        )}
      </AdminPanel>
    </AdminPage>
  );
}

function getRoleLabel(
  role: Role,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  switch (role) {
    case Role.ROOT:
      return dictionary.common.admin;
    case Role.AUTHOR:
      return dictionary.common.author;
    default:
      return dictionary.common.user;
  }
}

function getRoleActionLabel(
  role: Role,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  switch (role) {
    case Role.ROOT:
      return dictionary.admin.makeAdmin;
    case Role.AUTHOR:
      return dictionary.admin.makeAuthor;
    default:
      return dictionary.admin.makeUser;
  }
}

function roleTargets(role: Role) {
  if (role === Role.ROOT) {
    return [Role.AUTHOR, Role.USER];
  }

  if (role === Role.AUTHOR) {
    return [Role.USER, Role.ROOT];
  }

  return [Role.AUTHOR, Role.ROOT];
}

function roleBadgeVariant(role: Role) {
  switch (role) {
    case Role.ROOT:
      return "default" as const;
    case Role.AUTHOR:
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}
