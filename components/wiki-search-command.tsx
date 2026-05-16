"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useSearch } from "@/components/search-provider";
import { cn } from "@/lib/utils";

export function WikiSearchCommand({ className }: { className?: string }) {
  const { setOpen } = useSearch();
  const t = useT();

  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        "group relative flex h-9 w-full items-center justify-between rounded-xl border border-border/50 bg-background/50 px-3 text-sm text-muted-foreground shadow-sm transition-all hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 sm:pr-12",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Search className="size-4" />
        <span className="inline-flex">{t.wiki.searchPlaceholder}</span>
      </div>
      <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
