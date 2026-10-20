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
    <div className="max-h-[calc(100vh-7rem)] space-y-3 overflow-y-auto pb-4 no-scrollbar">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {t.wiki.onThisPage}
      </p>
      <nav className="border-l border-border/70">
        {items.map((item) => (
          <a
            className={cn(
              "-ml-px block border-l-2 py-1.5 pl-3 text-[12.5px] leading-5 transition-colors",
              item.level === 1 && "font-medium",
              item.level === 2 && "pl-4",
              item.level >= 3 && "pl-6",
              activeId === item.id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            href={`#${item.id}`}
            key={item.id}
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
            <span className="block truncate">{item.text}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
