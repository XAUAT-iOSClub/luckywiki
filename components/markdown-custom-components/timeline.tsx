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
        <h3 className="mb-5 text-[16px] font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h3>
      )}
      <div className="ml-2.5 space-y-6 border-l border-border/70 pl-5">
        {data?.map((item, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[26px] top-2 size-2.5 rounded-full bg-primary ring-4 ring-background" />
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              {item.date}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[13.5px] font-semibold text-foreground">{item.title}</div>
              {item.badge && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {item.badge}
                </span>
              )}
            </div>
            {item.description && (
              <div className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
