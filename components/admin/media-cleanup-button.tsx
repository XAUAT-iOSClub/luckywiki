"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/media/format";
import { formatTemplate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";

type CleanupResult = {
  deleted: number;
  dryRun: boolean;
  failed: number;
  freedBytes: number;
  graceDays: number;
  scanned: number;
};

export function MediaCleanupButton({ graceDays }: { graceDays: number }) {
  const t = useT();
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [preview, setPreview] = React.useState<CleanupResult | null>(null);
  const [completed, setCompleted] = React.useState<CleanupResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function requestCleanup(dryRun: boolean) {
    const response = await fetch("/api/admin/media/cleanup", {
      body: JSON.stringify({ dryRun }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      data?: CleanupResult;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      throw new Error(payload.error ?? t.admin.media.errors.cleanupFailed);
    }

    return payload.data;
  }

  async function loadPreview() {
    setIsLoading(true);
    setError(null);
    setCompleted(null);

    try {
      setPreview(await requestCleanup(true));
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : t.admin.media.errors.cleanupFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function runCleanup() {
    setIsRunning(true);
    setError(null);

    try {
      const result = await requestCleanup(false);
      setCompleted(result);
      router.refresh();
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : t.admin.media.errors.cleanupFailed,
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <>
      <Button
        className="rounded-full px-5"
        onClick={() => setIsOpen(true)}
        type="button"
        variant="outline"
      >
        <Sparkles />
        {t.admin.media.cleanupTitle}
      </Button>

      <Dialog
        onOpenChange={(nextOpen) => {
          setIsOpen(nextOpen);

          if (nextOpen) {
            setPreview(null);
            setCompleted(null);
            void loadPreview();
          }
        }}
        open={isOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.admin.media.cleanupTitle}</DialogTitle>
            <DialogDescription>
              {formatTemplate(t.admin.media.cleanupDescription, { days: graceDays })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {isLoading ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t.admin.media.cleanupRunning}
              </p>
            ) : completed ? (
              <div className="space-y-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="text-emerald-700 dark:text-emerald-400">
                  {formatTemplate(t.admin.media.cleanupSuccess, {
                    count: completed.deleted,
                    size: formatFileSize(completed.freedBytes),
                  })}
                </p>
                {completed.failed > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatTemplate(t.admin.media.cleanupFailedCount, {
                      count: completed.failed,
                    })}
                  </p>
                ) : null}
              </div>
            ) : preview ? (
              preview.scanned === 0 ? (
                <p className="rounded-md border border-border/60 p-3 text-muted-foreground">
                  {t.admin.media.cleanupEmpty}
                </p>
              ) : (
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <p>
                    {formatTemplate(t.admin.media.cleanupResult, {
                      count: preview.scanned,
                      size: formatFileSize(preview.freedBytes),
                    })}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {formatTemplate(t.admin.media.cleanupConfirm, {
                      count: preview.scanned,
                      size: formatFileSize(preview.freedBytes),
                    })}
                  </p>
                </div>
              )
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              disabled={isRunning}
              onClick={() => setIsOpen(false)}
              type="button"
              variant="outline"
            >
              {t.common.close}
            </Button>
            <Button
              disabled={
                isLoading ||
                isRunning ||
                Boolean(completed) ||
                !preview ||
                preview.scanned === 0
              }
              onClick={runCleanup}
              type="button"
              variant="destructive"
            >
              {isRunning ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {isRunning ? t.admin.media.cleanupRunning : t.admin.media.cleanupRun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
