import { notFound } from "next/navigation";
import { ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminUsers } from "@/lib/admin";
import { formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";
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
    <div className="flex flex-col gap-6 p-4 md:p-8 md:pt-6">
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

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            {dictionary.admin.peopleDirectory}
          </CardTitle>
          <CardDescription>{dictionary.admin.peopleDirectoryDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{dictionary.common.user}</TableHead>
                <TableHead>{dictionary.common.status}</TableHead>
                <TableHead className="text-center">{dictionary.common.articles}</TableHead>
                <TableHead className="text-center">{dictionary.common.comments}</TableHead>
                <TableHead className="text-center">{dictionary.admin.moderated}</TableHead>
                <TableHead className="pr-6 text-right">{dictionary.common.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10 rounded-xl">
                        <AvatarImage src={user.image || ""} alt={user.name} />
                        <AvatarFallback className="rounded-xl">
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={roleBadgeVariant(user.role)} className="h-5 px-1.5 text-[10px]">
                        {getRoleLabel(user.role, dictionary)}
                      </Badge>
                      {user.emailVerified ? (
                        <Badge variant="outline" className="gap-1 h-5 px-1.5 text-[10px]">
                          <UserRoundCheck className="size-3" />
                          {dictionary.common.verified.toLowerCase()}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{dictionary.common.unverified.toLowerCase()}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {formatNumber(lang, user._count.articles)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {formatNumber(lang, user._count.comments)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    <div className="flex items-center justify-center gap-1">
                      {user._count.approvedComments > 0 && <ShieldCheck className="size-3 text-primary" />}
                      {formatNumber(lang, user._count.approvedComments)}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      {roleTargets(user.role).map((targetRole) => (
                        <form key={targetRole} action={setUserRoleAction.bind(null, lang, user.id, targetRole)}>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs px-2"
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
