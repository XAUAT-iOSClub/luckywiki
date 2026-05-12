export default function WikiArticleLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 lg:px-12 animate-in fade-in duration-300">
      <div className="flex flex-col gap-10">
        {/* Title skeleton */}
        <header className="space-y-6 max-w-5xl">
          <div className="h-12 w-3/4 rounded-xl bg-muted/60 animate-pulse" />
          <div className="flex flex-wrap items-center gap-6">
            <div className="h-5 w-32 rounded-lg bg-muted/40 animate-pulse" />
            <div className="h-6 w-20 rounded-full bg-muted/40 animate-pulse" />
            <div className="h-6 w-16 rounded-full bg-muted/40 animate-pulse" />
          </div>
        </header>

        {/* Content skeleton */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_250px]">
          <div className="min-w-0">
            <div className="surface-panel md:p-12! md:shadow-xl border-border/40 overflow-hidden space-y-4">
              <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-4/6 rounded bg-muted/40 animate-pulse" />
              <div className="h-6 w-1/3 rounded bg-muted/40 animate-pulse mt-6" />
              <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-muted/40 animate-pulse" />
              <div className="h-6 w-2/5 rounded bg-muted/40 animate-pulse mt-6" />
              <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
            </div>
          </div>
          {/* TOC skeleton */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-3">
              <div className="h-5 w-20 rounded bg-muted/40 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-muted/30 animate-pulse" />
                <div className="h-4 w-36 rounded bg-muted/30 animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted/30 animate-pulse" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
