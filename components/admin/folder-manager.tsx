"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Loader2 } from "lucide-react";
import {
  previewFolderPathChangeAction,
  renameFolderAction,
} from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, List, ListRow } from "@/components/ui/page-ui";
import type { AdminFolderSummary } from "@/lib/admin";
import type { PathChangePreview } from "@/lib/articles/path-change";
import { formatTemplate } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/provider";

/**
 * Folder = path prefix. Renaming one moves the whole subtree, so the dialog
 * mirrors the editor flow: preview first, then confirm, with link rewriting on
 * by default.
 */
export function FolderManager({ folders }: { folders: AdminFolderSummary[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [target, setTarget] = React.useState<AdminFolderSummary | null>(null);
  const [nextPath, setNextPath] = React.useState("");
  const [preview, setPreview] = React.useState<PathChangePreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [rewriteLinks, setRewriteLinks] = React.useState(true);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return folders;
    }

    return folders.filter((folder) => folder.path.toLowerCase().includes(needle));
  }, [folders, query]);

  function openFolder(folder: AdminFolderSummary) {
    setTarget(folder);
    setNextPath(folder.path);
    setPreview(null);
    setError(null);
    setRewriteLinks(true);
  }

  function closeDialog() {
    if (isPreviewing || isSaving) {
      return;
    }

    setTarget(null);
    setPreview(null);
    setError(null);
  }

  function handlePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!target || isPreviewing || isSaving) {
      return;
    }

    const trimmed = nextPath.trim();

    if (!trimmed) {
      setError(t.wiki.pageActions.pathRequired);
      return;
    }

    setError(null);
    setIsPreviewing(true);

    void previewFolderPathChangeAction(locale, target.path, trimmed)
      .then((result) => {
        setPreview(result.preview);
        setError(result.ok ? null : result.error);
      })
      .catch(() => setError(t.admin.pathChange.renameFailed))
      .finally(() => setIsPreviewing(false));
  }

  function handleConfirm() {
    if (!target || isSaving || isPreviewing) {
      return;
    }

    setError(null);
    setIsSaving(true);

    void renameFolderAction(locale, target.path, nextPath.trim(), { rewriteLinks })
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }

        setTarget(null);
        setPreview(null);
        router.refresh();
      })
      .catch(() => setError(t.admin.pathChange.renameFailed))
      .finally(() => setIsSaving(false));
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border/60 px-5 py-3">
        <Input
          className="h-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.admin.folders.name}
          value={query}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState description={t.admin.folders.empty} icon={FolderTree} title={t.admin.folders.empty} />
      ) : (
        <List className="max-h-[460px] overflow-y-auto">
          {filtered.map((folder) => (
            <ListRow
              className="flex items-center justify-between gap-4 py-3"
              key={folder.path}
            >
              <div
                className="min-w-0 space-y-1"
                style={{ paddingLeft: `${Math.min(folder.depth, 8) * 14}px` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[12.5px] text-foreground">
                    /{folder.path}
                  </span>
                  {folder.isArticle ? (
                    <Badge variant="secondary">{t.admin.folders.isArticle}</Badge>
                  ) : null}
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  {formatTemplate(t.admin.folders.counts, {
                    total: folder.totalArticles,
                    published: folder.publishedArticles,
                    draft: folder.draftArticles,
                  })}
                </p>
              </div>

              <Button
                className="shrink-0"
                onClick={() => openFolder(folder)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t.admin.folderRename.open}
              </Button>
            </ListRow>
          ))}
        </List>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        open={Boolean(target)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.admin.folderRename.dialogTitle}</DialogTitle>
            <DialogDescription>
              {t.admin.folderRename.dialogDescription}
            </DialogDescription>
          </DialogHeader>

          {preview?.status === "ok" ? (
            <div className="flex flex-col gap-4 text-[12.5px]">
              <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-muted-foreground">
                  {t.admin.folderRename.currentPath}:{" "}
                  <span className="font-mono text-foreground">/{target?.path}</span>
                </p>
                <p className="text-muted-foreground">
                  {t.admin.pathChange.nextPath}:{" "}
                  <span className="font-mono text-foreground">/{preview.nextPath}</span>
                </p>
              </div>

              <ul className="flex flex-col gap-1 text-muted-foreground">
                <li>
                  {formatTemplate(t.admin.pathChange.affectedPages, {
                    count: preview.movedCount,
                    published: preview.publishedCount,
                  })}
                </li>
                <li>
                  {formatTemplate(t.admin.pathChange.redirectsCreated, {
                    count: preview.redirectCount,
                  })}
                </li>
                <li>
                  {preview.linkCount > 0
                    ? formatTemplate(t.admin.pathChange.linkUpdates, {
                        articles: preview.linkArticleCount,
                        links: preview.linkCount,
                      })
                    : t.admin.pathChange.noLinkUpdates}
                </li>
              </ul>

              <label className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2">
                <input
                  checked={rewriteLinks}
                  className="mt-0.5 size-3.5 accent-foreground"
                  onChange={(event) => setRewriteLinks(event.target.checked)}
                  type="checkbox"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-foreground">
                    {t.admin.pathChange.linkRewriteLabel}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {t.admin.pathChange.linkRewriteHint}
                  </span>
                </span>
              </label>

              {error ? (
                <p className="text-[12px] text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  disabled={isSaving}
                  onClick={() => setPreview(null)}
                  type="button"
                  variant="outline"
                >
                  {t.admin.pathChange.cancel}
                </Button>
                <Button disabled={isSaving} onClick={handleConfirm} type="button">
                  {isSaving ? <Loader2 className="animate-spin" /> : null}
                  {isSaving
                    ? t.admin.folderRename.renaming
                    : t.admin.folderRename.confirm}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handlePreview}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folder-rename-path">
                  {t.admin.folderRename.newPath}
                </Label>
                <Input
                  autoComplete="off"
                  autoFocus
                  className="font-mono text-[12.5px]"
                  id="folder-rename-path"
                  onChange={(event) => {
                    setNextPath(event.target.value);
                    setPreview(null);
                    setError(null);
                  }}
                  spellCheck={false}
                  value={nextPath}
                />
                <p className="text-[11.5px] leading-5 text-muted-foreground">
                  {t.admin.folderRename.currentPath}:{" "}
                  <span className="font-mono">/{target?.path}</span>
                </p>
              </div>

              {error ? (
                <p className="text-[12px] text-destructive" role="alert">
                  {error}
                  {preview?.conflictPath ? (
                    <span className="block font-mono text-[11.5px] opacity-80">
                      {formatTemplate(t.admin.pathChange.conflictAt, {
                        path: preview.conflictPath,
                      })}
                    </span>
                  ) : null}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  disabled={isPreviewing}
                  onClick={closeDialog}
                  type="button"
                  variant="outline"
                >
                  {t.admin.pathChange.cancel}
                </Button>
                <Button disabled={isPreviewing} type="submit">
                  {isPreviewing ? <Loader2 className="animate-spin" /> : null}
                  {isPreviewing
                    ? t.admin.pathChange.previewing
                    : t.wiki.pageActions.previewImpact}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
