import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { requireRootSession } from "@/lib/session";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireRootSession();

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="surface-panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="text-2xl font-semibold">LuckyWiki control room</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="button-secondary" href="/admin/articles">
              Articles
            </Link>
            <Link className="button-secondary" href="/admin/comments">
              Comments
            </Link>
            <Link className="button-secondary" href="/wiki">
              View wiki
            </Link>
            <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
              {session.user.name}
            </span>
            <SignOutButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
