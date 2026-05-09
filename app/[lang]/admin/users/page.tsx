import { notFound } from "next/navigation";
import { ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAdminUsers } from "@/lib/admin";
import { formatDate, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/session";
import { setUserRoleAction } from "@/app/actions/admin";

type Params = Promise<{ lang: string }>;

export default async function AdminUsersPage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [users, dictionary] = await Promise.all([listAdminUsers(), getDictionary(lang)]);
  const rootCount = users.filter((user) => user.role === Role.ROOT).length;
  const authorCount = users.filter((user) => user.role === Role.AUTHOR).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <p className="eyebrow">{dictionary.admin.contributorsEyebrow}</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{dictionary.admin.contributorsTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              {dictionary.admin.contributorsDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {formatTemplate(dictionary.admin.totalUsers, {
                count: formatNumber(lang, users.length),
              })}
            </Badge>
            <Badge variant="secondary">
              {formatTemplate(dictionary.admin.authors, {
                count: formatNumber(lang, authorCount),
              })}
            </Badge>
            <Badge variant="secondary">
              {formatTemplate(dictionary.admin.admins, {
                count: formatNumber(lang, rootCount),
              })}
            </Badge>
            <Badge variant="secondary">
              {formatTemplate(dictionary.admin.verifiedUsers, {
                count: formatNumber(
                  lang,
                  users.filter((user) => user.emailVerified).length,
                ),
              })}
            </Badge>
          </div>
        </div>
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            {dictionary.admin.peopleDirectory}
          </CardTitle>
          <CardDescription>{dictionary.admin.peopleDirectoryDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-4 rounded-[1.5rem] border border-border/60 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex items-center gap-4">
                <Avatar className="size-12 rounded-2xl">
                  <AvatarImage src={user.image || ""} alt={user.name} />
                  <AvatarFallback className="rounded-2xl">
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.name}</span>
                    <Badge variant={roleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role, dictionary)}
                    </Badge>
                    {user.emailVerified ? (
                      <Badge variant="outline" className="gap-1">
                        <UserRoundCheck className="size-3.5" />
                        {dictionary.common.verified.toLowerCase()}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{dictionary.common.unverified.toLowerCase()}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTemplate(dictionary.admin.joinedUpdated, {
                      joined: formatDate(lang, user.createdAt),
                      updated: formatDate(lang, user.updatedAt),
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[360px]">
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                  <StatCard label={dictionary.common.articles} value={user._count.articles} />
                  <StatCard label={dictionary.common.comments} value={user._count.comments} />
                  <StatCard
                    label={dictionary.admin.moderated}
                    value={user._count.approvedComments}
                    icon={<ShieldCheck className="size-3.5" />}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {roleTargets(user.role).map((targetRole) => (
                    <form key={targetRole} action={setUserRoleAction.bind(null, lang, user.id, targetRole)}>
                      <Button
                        type="submit"
                        variant={targetRole === Role.ROOT ? "default" : "outline"}
                        size="sm"
                        disabled={user.role === Role.ROOT && rootCount <= 1 && targetRole !== Role.ROOT}
                        title={
                          user.role === Role.ROOT && rootCount <= 1 && targetRole !== Role.ROOT
                            ? dictionary.admin.protectedLastAdmin
                            : undefined
                        }
                      >
                        {getRoleActionLabel(targetRole, dictionary)}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function getRoleLabel(role: Role, dictionary: Awaited<ReturnType<typeof getDictionary>>) {
  switch (role) {
    case Role.ROOT:
      return dictionary.common.admin;
    case Role.AUTHOR:
      return dictionary.common.author;
    default:
      return dictionary.common.user;
  }
}

function getRoleActionLabel(role: Role, dictionary: Awaited<ReturnType<typeof getDictionary>>) {
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
      <p className="flex items-center gap-1 text-xs uppercase tracking-[0.18em]">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
