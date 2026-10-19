"use client";

import * as React from "react";
import {
  ChevronRight,
  Folder,
  Search,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WikiTreeNode, buildWikiTree } from "@/lib/wiki/tree";
import { cn } from "@/lib/utils";
import { useT, useLocale } from "@/lib/i18n/provider";
import { listArticlePathsAction } from "@/app/actions/admin";

type PathPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  currentPath: string;
};

export function PathPicker({
  open,
  onOpenChange,
  onSelect,
  currentPath,
}: PathPickerProps) {
  const t = useT();
  const locale = useLocale();
  const [tree, setTree] = React.useState<WikiTreeNode | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    async function fetchTree() {
      if (!open || tree) return;
      
      setIsLoading(true);
      try {
        const articles = await listArticlePathsAction(locale);
        setTree(buildWikiTree(articles));
      } finally {
        setIsLoading(false);
      }
    }

    fetchTree();
  }, [open, tree]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredTree = React.useMemo(() => {
    if (!tree || !normalizedSearchQuery) return tree;
    return filterWikiTree(tree, normalizedSearchQuery);
  }, [tree, normalizedSearchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="px-5 pb-0 pt-5">
          <DialogTitle>{t.admin.articleEditor.pathPicker.title}</DialogTitle>
          <DialogDescription>
            {t.admin.articleEditor.pathPicker.description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3">
          <div className="relative group/search">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.wiki.searchPlaceholder}
              className="h-8 pl-8"
            />
          </div>
        </div>

        <ScrollArea className="h-[380px] px-2 pb-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-[12.5px] text-muted-foreground">
              {t.common.working}
            </div>
          ) : filteredTree ? (
            <div className="space-y-1 px-4">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-full justify-start rounded-md font-medium",
                  currentPath === "" && "bg-accent text-foreground hover:bg-accent"
                )}
                onClick={() => {
                  onSelect("");
                  onOpenChange(false);
                }}
              >
                <Folder className="size-4 mr-2" />
                {t.admin.articleEditor.pathPicker.root}
              </Button>
              <div className="mt-2 space-y-1">
                {filteredTree.children.map((child) => (
                  <TreeItem
                    key={child.path}
                    node={child}
                    onSelect={(path) => {
                      onSelect(path);
                      onOpenChange(false);
                    }}
                    currentPath={currentPath}
                    defaultExpanded={!!normalizedSearchQuery}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function TreeItem({
  node,
  onSelect,
  currentPath,
  defaultExpanded = false,
}: {
  node: WikiTreeNode;
  onSelect: (path: string) => void;
  currentPath: string;
  defaultExpanded?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isActive = currentPath === node.path || currentPath.startsWith(`${node.path}/`);
  const isSelected = currentPath === node.path;

  return (
    <Collapsible defaultOpen={defaultExpanded || isActive}>
      <div className="group flex items-center gap-1">
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 rounded-md hover:bg-muted"
            >
              <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <div className="size-6 shrink-0" />
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 flex-1 justify-start rounded-md px-2 text-[12.5px]",
            isSelected ? "bg-accent text-foreground hover:bg-accent" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onSelect(node.path)}
        >
          <Folder className={cn("size-3.5 mr-2", isSelected ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("truncate", isSelected && "font-medium")}>{node.label}</span>
        </Button>
      </div>
      {hasChildren && (
        <CollapsibleContent className="ml-3 mt-1 space-y-0.5 border-l border-border/60 pl-3">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              onSelect={onSelect}
              currentPath={currentPath}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function matchesWikiTreeNode(node: WikiTreeNode, query: string) {
  return [node.label, node.articleTitle, node.path, node.segment]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

function filterWikiTree(node: WikiTreeNode, query: string): WikiTreeNode {
  const filteredChildren = node.children
    .map((child) => filterWikiTree(child, query))
    .filter((child) => child.articleTitle || child.children.length > 0);
  const matches = matchesWikiTreeNode(node, query);

  if (node.path === "") {
    return {
      ...node,
      children: filteredChildren,
    };
  }

  if (!matches && filteredChildren.length === 0) {
    return {
      ...node,
      articleTitle: undefined,
      children: [],
    };
  }

  return {
    ...node,
    children: matches && filteredChildren.length === 0 ? node.children : filteredChildren,
  };
}
