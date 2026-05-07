import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="surface-panel max-w-xl space-y-5 text-center">
        <p className="eyebrow">404</p>
        <h1 className="text-3xl font-semibold text-balance">This wiki page does not exist yet.</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          The path may be unpublished, mistyped, or still waiting for its first article.
        </p>
        <div className="flex justify-center gap-3">
          <Link className="button-primary" href="/wiki">
            Back to wiki root
          </Link>
          <Link className="button-secondary" href="/admin/articles">
            Open admin
          </Link>
        </div>
      </div>
    </main>
  );
}
