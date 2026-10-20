"use client";

import * as React from "react";
import Link from "next/link";
import { Images, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { formatFileSize } from "@/lib/media/format";

export type MediaPickerAsset = {
  altText: string | null;
  fileName: string;
  id: string;
  size: number;
  url: string;
};

type MediaPickerProps = {
  disabled?: boolean;
  onSelect: (asset: MediaPickerAsset) => void;
  triggerClassName?: string;
};

export function MediaPicker({
  disabled,
  onSelect,
  triggerClassName,
}: MediaPickerProps) {
  const t = useT();
  const locale = useLocale();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [assets, setAssets] = React.useState<MediaPickerAsset[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: "36",
          q: query.trim(),
          sort: "newest",
          usage: "all",
        });
        const response = await fetch(`/api/admin/media?${params}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          data?: { assets?: MediaPickerAsset[] };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? t.admin.media.errors.uploadFailed);
        }

        setAssets(payload.data?.assets ?? []);
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t.admin.media.errors.uploadFailed,
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isOpen, query, t.admin.media.errors.uploadFailed]);

  return (
    <>
      <Button
        className={triggerClassName}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Images className="size-3.5 md:mr-2" />
        <span className="hidden md:inline">
          {t.admin.articleEditor.insertFromLibrary}
        </span>
      </Button>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="size-5 text-primary" />
              {t.admin.media.pickerTitle}
            </DialogTitle>
            <DialogDescription>
              {t.admin.media.pickerDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.admin.media.pickerSearch}
                value={query}
              />
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                href={localizeHref(locale, "/admin/media")}
                rel="noreferrer"
                target="_blank"
              >
                {t.admin.media.pickerManage}
              </Link>
            </Button>
          </div>

          <div className="max-h-[55vh] min-h-48 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t.admin.media.pickerLoading}
              </div>
            ) : error ? (
              <p className="py-10 text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : assets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t.admin.media.pickerEmpty}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((asset) => (
                  <button
                    className="group overflow-hidden rounded-xl border border-border/60 bg-card/60 text-left transition hover:border-primary/50 hover:shadow-md focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    key={asset.id}
                    onClick={() => {
                      onSelect(asset);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={asset.altText ?? asset.fileName}
                      className="aspect-[4/3] w-full bg-muted object-cover"
                      loading="lazy"
                      src={asset.url}
                    />
                    <span className="block space-y-0.5 p-2">
                      <span
                        className="block truncate text-xs font-medium"
                        title={asset.fileName}
                      >
                        {asset.fileName}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formatFileSize(asset.size)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
