export default function WikiArticleLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 py-8 sm:px-8 md:px-12 md:py-10">
      <div className="max-w-3xl space-y-4">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-10 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="flex gap-3">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>

      <div className="h-px w-full bg-border/60" />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-16">
        <div className="max-w-3xl space-y-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              className="h-4 animate-pulse rounded bg-muted/70"
              key={index}
              style={{ width: `${[100, 92, 96, 84, 100, 76, 100, 88, 94, 82, 100, 68][index]}%` }}
            />
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="space-y-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted/70" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/70" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
          </div>
        </aside>
      </div>
    </div>
  );
}
