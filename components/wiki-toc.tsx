"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function WikiToc({ markdown }: { markdown: string }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const t = useT();

  // Extract headings from the DOM after rendering
  useEffect(() => {
    const extract = () => {
      const article = document.querySelector("article");
      if (!article) return;

      const headings = Array.from(article.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      const extractedItems: TocItem[] = headings
        .map((h) => ({
          id: h.id,
          text: (h as HTMLElement).innerText.replace("#", "").trim(),
          level: parseInt(h.tagName[1]),
        }))
        .filter((item) => item.id);

      setItems(extractedItems);
    };

    // Use a slightly longer delay and also try multiple times if needed
    const timer = setTimeout(extract, 300);
    return () => clearTimeout(timer);
  }, [markdown]);

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Track which items are visible
        const visibleEntries = entries.filter(e => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by their position in the viewport (topmost first)
          const sorted = visibleEntries.sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
          setActiveId(sorted[0].target.id);
        }
      },
      {
        rootMargin: "-90px 0% -70% 0%",
        threshold: 0,
      }
    );

    const headingElements = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];
    
    headingElements.forEach((el) => observer.observe(el));

    return () => {
      headingElements.forEach((el) => observer.unobserve(el));
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-4 max-h-[calc(100vh-10rem)] overflow-y-auto no-scrollbar py-2 pr-2">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 px-3">
        {t.wiki.onThisPage}
      </h4>
      <nav className="space-y-0.5 relative px-1">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={cn(
              "block py-1.5 px-3 text-[13px] transition-all rounded-xl relative group",
              item.level === 1 && "font-semibold",
              item.level >= 2 && "pl-5",
              item.level === 3 && "pl-8",
              activeId === item.id
                ? "text-primary bg-primary/5 font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
            onClick={(e) => {
              e.preventDefault();
              const element = document.getElementById(item.id);
              if (element) {
                element.scrollIntoView({ behavior: "smooth" });
                window.history.pushState(null, "", `#${item.id}`);
                setActiveId(item.id);
              }
            }}
          >
            {activeId === item.id && (
              <span className="absolute left-1.5 top-2.5 bottom-2.5 w-0.5 bg-primary rounded-full" />
            )}
            <span className="truncate block">{item.text}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
