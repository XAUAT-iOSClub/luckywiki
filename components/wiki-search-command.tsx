"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useSearch } from "@/components/search-provider";
import { cn } from "@/lib/utils";

export function WikiSearchCommand({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { setOpen } = useSearch();
  const t = useT();

  if (compact) {
    return (
      <button
        aria-label={t.common.search}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <button
      className={cn(
        "group relative flex h-8 w-full items-center justify-between rounded-md border border-input bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:pr-12",
        className,
      )}
      onClick={() => setOpen(true)}
      type="button"
    >
      <span className="flex items-center gap-2">
        <Search className="size-3.5" />
        <span className="inline-flex">{t.wiki.searchPlaceholder}</span>
      </span>
      <kbd className="pointer-events-none absolute right-1.5 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border border-border/70 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        <span className="text-[11px]">⌘</span>K
      </kbd>
    </button>
  );
}
