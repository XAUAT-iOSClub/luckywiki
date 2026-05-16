"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchArticlesAction } from "@/app/actions/search";
import { type SearchResult } from "@/lib/search";
import { buildWikiHref } from "@/lib/wiki/path";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearch } from "@/components/search-provider";

export function WikiSearchDialog() {
  const { open, setOpen } = useSearch();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const router = useRouter();
  const locale = useLocale();
  const t = useT();

  React.useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }

    const search = async () => {
      setIsLoading(true);
      try {
        const { results } = await searchArticlesAction(debouncedQuery);
        setResults(results);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    search();
  }, [debouncedQuery]);

  const onSelect = (path: string) => {
    setOpen(false);
    router.push(buildWikiHref(path, locale));
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder={t.search.inputPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : query ? (
            t.search.noResults
          ) : (
            t.search.noQuery
          )}
        </CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading={t.common.articles}>
            {results.map((result) => (
              <CommandItem
                key={result.id}
                value={result.title}
                onSelect={() => onSelect(result.path)}
              >
                <FileText className="mr-2 size-4" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{result.title}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[400px]">
                    /{result.path}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
