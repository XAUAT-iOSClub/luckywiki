import { ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import { listAdminUsers } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

export default async function AdminUsersPage() {
  const users = await listAdminUsers();

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <p className="eyebrow">Contributors</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">See who is shaping the wiki</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Review authors, commenters, and moderators to understand where content
              activity is coming from.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{users.length} total users</Badge>
            <Badge variant="secondary">
              {users.filter((user) => user.role === Role.ROOT).length} admins
            </Badge>
            <Badge variant="secondary">
              {users.filter((user) => user.emailVerified).length} verified
            </Badge>
          </div>
        </div>
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            People directory
          </CardTitle>
          <CardDescription>
            Publishing and community activity ordered by contribution volume.
          </CardDescription>
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
                    <Badge variant={user.role === Role.ROOT ? "default" : "secondary"}>
                      {user.role.toLowerCase()}
                    </Badge>
                    {user.emailVerified ? (
                      <Badge variant="outline" className="gap-1">
                        <UserRoundCheck className="size-3.5" />
                        verified
                      </Badge>
                    ) : (
                      <Badge variant="outline">unverified</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {user.createdAt.toLocaleDateString()} · Updated{" "}
                    {user.updatedAt.toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3 lg:min-w-[360px]">
                <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                  <p className="text-xs uppercase tracking-[0.18em]">Articles</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {user._count.articles}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                  <p className="text-xs uppercase tracking-[0.18em]">Comments</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {user._count.comments}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                  <p className="flex items-center gap-1 text-xs uppercase tracking-[0.18em]">
                    <ShieldCheck className="size-3.5" />
                    Moderated
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {user._count.approvedComments}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
