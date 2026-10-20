"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type WikiTocPresenceReporter = (present: boolean) => void;

const WikiTocPresenceContext = createContext<WikiTocPresenceReporter | null>(
  null,
);

/**
 * Lets the table of contents tell the article layout whether it rendered
 * anything, so the two-column grid is only enabled when there is a TOC.
 */
export function useWikiTocPresence() {
  return useContext(WikiTocPresenceContext);
}

export function WikiArticleLayout({
  children,
  toc,
  hasInitialToc,
}: {
  children: ReactNode;
  toc: ReactNode;
  hasInitialToc: boolean;
}) {
  const [hasToc, setHasToc] = useState(hasInitialToc);

  return (
    <WikiTocPresenceContext.Provider value={setHasToc}>
      <div
        className={cn(
          "grid grid-cols-1 gap-10",
          hasToc && "lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-16",
        )}
      >
        <div className="min-w-0">
          {/* Keep the readable measure only while the TOC column exists; a
              page without a TOC gets the full width instead of a narrow column. */}
          <div className={hasToc ? "max-w-3xl" : undefined}>{children}</div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">{toc}</div>
        </aside>
      </div>
    </WikiTocPresenceContext.Provider>
  );
}
