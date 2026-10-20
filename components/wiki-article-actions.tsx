"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderInput,
  History,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  deleteArticleAction,
  getArticleHeaderInfoAction,
  moveArticleAction,
} from "@/app/actions/admin";
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
import type { ArticleHeaderInfo } from "@/lib/articles/header";
import { localizeHref } from "@/lib/i18n/config";
import { formatTemplate } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/provider";
import {
  buildWikiHref,
  getWikiArticlePathFromPathname,
} from "@/lib/wiki/path";

export function WikiArticleActionsController({
  initialPath,
  initialArticle,
}: {
  initialPath: string | null;
  initialArticle: ArticleHeaderInfo | null;
}) {
  const pathname = usePathname();
  const currentPath = getWikiArticlePathFromPathname(pathname);
  const [fetched, setFetched] = React.useState<{
    path: string;
    article: ArticleHeaderInfo | null;
  } | null>(null);

  React.useEffect(() => {
    if (!currentPath || currentPath === initialPath) {
      return;
    }

    let cancelled = false;
    const path = currentPath;

    void getArticleHeaderInfoAction(path)
      .then((article) => {
        if (!cancelled) {
          setFetched({ path, article });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetched({ path, article: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPath, initialPath]);

  // Prefer a freshly resolved article, but fall back to the server-rendered
  // one for the current path. While a new path is resolving, `fetched` points
  // at the previous article and no actions are shown.
  const article = !currentPath
    ? null
    : fetched?.path === currentPath
      ? fetched.article
      : currentPath === initialPath
        ? initialArticle
        : null;

  if (!article) {
    return null;
  }

  return <WikiArticleActions article={article} key={article.id} />;
}

export function WikiArticleActions({ article }: { article: ArticleHeaderInfo }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [isMoveOpen, setIsMoveOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [nextPath, setNextPath] = React.useState(article.path);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const editHref = localizeHref(locale, `/admin/articles/${article.id}`);
  const historyHref = localizeHref(
    locale,
    `/admin/articles/${article.id}/history`,
  );

  function handleMoveOpenChange(open: boolean) {
    if (isPending) return;

    setIsMoveOpen(open);

    if (open) {
      setNextPath(article.path);
      setError(null);
    }
  }

  function handleDeleteOpenChange(open: boolean) {
    if (isPending) return;

    setIsDeleteOpen(open);

    if (open) {
      setError(null);
    }
  }

  function handleMove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    const targetPath = nextPath.trim();

    if (!targetPath) {
      setError(t.wiki.pageActions.pathRequired);
      return;
    }

    if (targetPath === article.path) {
      setError(t.wiki.pageActions.samePath);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await moveArticleAction(locale, article.id, targetPath);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        if (!result.path) {
          setError(t.wiki.pageActions.moveFailed);
          return;
        }

        setIsMoveOpen(false);
        router.push(buildWikiHref(result.path, locale));
        router.refresh();
      } catch {
        setError(t.wiki.pageActions.moveFailed);
      }
    });
  }

  function handleDelete() {
    if (isPending) return;

    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteArticleAction(locale, article.id);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setIsDeleteOpen(false);
        router.push(localizeHref(locale, "/wiki"));
        router.refresh();
      } catch {
        setError(t.wiki.pageActions.deleteFailed);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card/55 p-0.5">
        <Button
          asChild
          className="px-1.5 text-muted-foreground hover:text-foreground lg:px-2.5"
          size="sm"
          variant="ghost"
        >
          <Link
            aria-label={t.wiki.pageActions.edit}
            href={editHref}
            title={t.wiki.pageActions.edit}
          >
            <Pencil />
            <span className="hidden lg:inline">{t.wiki.pageActions.edit}</span>
          </Link>
        </Button>

        <Button
          asChild
          className="px-1.5 text-muted-foreground hover:text-foreground lg:px-2.5"
          size="sm"
          variant="ghost"
        >
          <Link
            aria-label={t.wiki.pageActions.history}
            href={historyHref}
            title={t.wiki.pageActions.history}
          >
            <History />
            <span className="hidden lg:inline">{t.wiki.pageActions.history}</span>
          </Link>
        </Button>

        <Button
          aria-label={t.wiki.pageActions.move}
          className="px-1.5 text-muted-foreground hover:text-foreground lg:px-2.5"
          onClick={() => handleMoveOpenChange(true)}
          size="sm"
          title={t.wiki.pageActions.move}
          type="button"
          variant="ghost"
        >
          <FolderInput />
          <span className="hidden lg:inline">{t.wiki.pageActions.move}</span>
        </Button>

        <Button
          aria-label={t.wiki.pageActions.delete}
          className="px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:px-2.5"
          onClick={() => handleDeleteOpenChange(true)}
          size="sm"
          title={t.wiki.pageActions.delete}
          type="button"
          variant="ghost"
        >
          <Trash2 />
          <span className="hidden lg:inline">{t.wiki.pageActions.delete}</span>
        </Button>
      </div>

      <Dialog onOpenChange={handleMoveOpenChange} open={isMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.wiki.pageActions.moveTitle}</DialogTitle>
            <DialogDescription>
              {t.wiki.pageActions.moveDescription}
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleMove}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiki-article-move-path">
                {t.wiki.pageActions.newPath}
              </Label>
              <Input
                autoFocus
                autoComplete="off"
                className="font-mono text-[12.5px]"
                id="wiki-article-move-path"
                onChange={(event) => setNextPath(event.target.value)}
                spellCheck={false}
                value={nextPath}
              />
              <p className="text-[11.5px] leading-5 text-muted-foreground">
                {t.wiki.pageActions.currentPath}:{" "}
                <span className="font-mono">/{article.path}</span>
              </p>
            </div>

            {error ? (
              <p className="text-[12px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={() => handleMoveOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t.wiki.pageActions.cancel}
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderInput />
                )}
                {isPending
                  ? t.wiki.pageActions.moving
                  : t.wiki.pageActions.moveConfirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={handleDeleteOpenChange} open={isDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.wiki.pageActions.deleteTitle}</DialogTitle>
            <DialogDescription>
              {formatTemplate(t.wiki.pageActions.deleteDescription, {
                title: article.title,
              })}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => handleDeleteOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t.wiki.pageActions.cancel}
            </Button>
            <Button
              disabled={isPending}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isPending
                ? t.wiki.pageActions.deleting
                : t.wiki.pageActions.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
