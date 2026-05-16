"use client";

import { cn } from "@/lib/utils";

type TimelineItem = {
  date?: string;
  title?: string;
  badge?: string;
  description?: string;
};

export function Timeline({
  title,
  data,
  className,
}: {
  title?: string;
  data?: TimelineItem[];
  className?: string;
}) {
  return (
    <div className={cn("my-8", className)}>
      {title && (
        <h3 className="mb-6 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      )}
      <div className="ml-3 space-y-8 border-l-2 border-border/50 pl-6">
        {data?.map((item, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-4 border-background bg-primary ring-1 ring-border" />
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {item.date}
            </div>
            <div className="flex items-center gap-3">
              <div className="font-semibold text-foreground">{item.title}</div>
              {item.badge && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {item.badge}
                </span>
              )}
            </div>
            {item.description && (
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
