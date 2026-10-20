"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildImageMarkdown } from "@/lib/media/markdown";
import { formatTemplate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";

type MediaActionsProps = {
  altText: string | null;
  assetId: string;
  canDelete: boolean;
  canForce: boolean;
  fileName: string;
  referenceCount: number;
  url: string;
};

export function MediaActions({
  altText,
  assetId,
  canDelete,
  canForce,
  fileName,
  referenceCount,
  url,
}: MediaActionsProps) {
  const t = useT();
  const router = useRouter();
  const [copied, setCopied] = React.useState<"markdown" | "url" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [force, setForce] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy(value: string, kind: "markdown" | "url") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/media/${encodeURIComponent(assetId)}${force ? "?force=1" : ""}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(getDeleteErrorMessage(payload.code, payload.error, t));
        return;
      }

      setIsDialogOpen(false);
      router.refresh();
    } catch {
      setError(t.admin.media.errors.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          onClick={() =>
            copy(buildImageMarkdown(url, altText ?? fileName), "markdown")
          }
          size="xs"
          type="button"
          variant="outline"
        >
          {copied === "markdown" ? <Check /> : <Copy />}
          {copied === "markdown"
            ? t.admin.media.copied
            : t.admin.media.copyMarkdown}
        </Button>
        <Button
          onClick={() => copy(url, "url")}
          size="xs"
          type="button"
          variant="ghost"
        >
          {copied === "url" ? <Check /> : <Copy />}
          {copied === "url" ? t.admin.media.copied : t.admin.media.copyUrl}
        </Button>
        {canDelete ? (
          <Button
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setForce(false);
              setError(null);
              setIsDialogOpen(true);
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Trash2 />
            {t.admin.media.delete}
          </Button>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!isDeleting) {
            setIsDialogOpen(nextOpen);
          }
        }}
        open={isDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.admin.media.deleteTitle}</DialogTitle>
            <DialogDescription className="break-all">
              {fileName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t.admin.media.deleteDescription}
            </p>
            {referenceCount > 0 ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-destructive">
                {formatTemplate(t.admin.media.deleteInUseDescription, {
                  count: referenceCount,
                })}
              </p>
            ) : null}
            {referenceCount > 0 && canForce ? (
              <label className="flex items-start gap-2 rounded-md border border-border/60 p-3 text-xs leading-5">
                <input
                  checked={force}
                  className="mt-0.5 accent-destructive"
                  onChange={(event) => setForce(event.target.checked)}
                  type="checkbox"
                />
                {formatTemplate(t.admin.media.forceDelete, {
                  count: referenceCount,
                })}
              </label>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setIsDialogOpen(false)}
              type="button"
              variant="outline"
            >
              {t.common.close}
            </Button>
            <Button
              disabled={
                isDeleting ||
                (referenceCount > 0 && (!canForce || !force))
              }
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isDeleting
                ? t.admin.media.deleting
                : t.admin.media.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getDeleteErrorMessage(
  code: string | undefined,
  fallback: string | undefined,
  t: ReturnType<typeof useT>,
) {
  switch (code) {
    case "MEDIA_IN_USE":
      return t.admin.media.errors.inUse;
    case "FORBIDDEN":
      return t.admin.media.errors.forbidden;
    case "NOT_FOUND":
      return t.admin.media.errors.notFound;
    case "UNAUTHORIZED":
      return t.admin.media.errors.unauthorized;
    default:
      return fallback ?? t.admin.media.errors.deleteFailed;
  }
}
