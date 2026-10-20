"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
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
import { ARTICLE_IMPORT_MAX_FILES } from "@/lib/articles/import-constants";
import { formatTemplate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { formatFileSize } from "@/lib/media/format";
import { cn } from "@/lib/utils";

type ImportAction = "create" | "update" | "unchanged" | "error";

type ImportPlanItem = {
  fileName: string;
  relativePath: string;
  path: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  editor: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
  action: ImportAction;
  warnings: string[];
  error: string | null;
  existingId: string | null;
};

type ImportSummary = {
  create: number;
  update: number;
  unchanged: number;
  error: number;
  total: number;
};

type ImportPreview = {
  items: ImportPlanItem[];
  summary: ImportSummary;
};

type AppliedImportItem = {
  fileName: string;
  path: string | null;
  action: "created" | "updated" | "skipped" | "failed";
  error: string | null;
};

type ImportApplyResult = {
  items: AppliedImportItem[];
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type ApiPayload = {
  code?: string;
  data?: unknown;
  details?: Record<string, string>;
  error?: string;
};

type SelectablePlanItem = ImportPlanItem & { path: string };

export function ArticleImportDialog() {
  const t = useT();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const requestRef = React.useRef(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [prefix, setPrefix] = React.useState("");
  const [status, setStatus] = React.useState<ArticleStatus>(
    ArticleStatus.PUBLISHED,
  );
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [result, setResult] = React.useState<ImportApplyResult | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const selectableItems: SelectablePlanItem[] =
    preview?.items.filter(
      (item): item is SelectablePlanItem =>
        item.path !== null &&
        (item.action === "create" || item.action === "update"),
    ) ?? [];

  function resetState() {
    requestRef.current += 1;
    setFiles([]);
    setPrefix("");
    setStatus(ArticleStatus.PUBLISHED);
    setPreview(null);
    setSelectedPaths(new Set());
    setResult(null);
    setIsParsing(false);
    setIsApplying(false);
    setIsDragging(false);
    setError(null);
    setNotice(null);
  }

  function invalidatePreview() {
    requestRef.current += 1;
    setIsParsing(false);
    setPreview(null);
    setSelectedPaths(new Set());
  }

  function buildFormData(mode: "preview" | "apply", nextFiles: File[]) {
    const formData = new FormData();

    formData.set("mode", mode);
    formData.set("prefix", prefix);
    formData.set(
      "status",
      status === ArticleStatus.DRAFT ? "draft" : "published",
    );

    for (const file of nextFiles) {
      formData.append("files", file);
    }

    return formData;
  }

  async function loadPreview(nextFiles: File[]) {
    if (nextFiles.length === 0) {
      setError(t.admin.articleImport.noFiles);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsParsing(true);
    setIsApplying(false);
    setPreview(null);
    setResult(null);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/articles/import", {
        body: buildFormData("preview", nextFiles),
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (requestRef.current !== requestId) {
        return;
      }

      if (!response.ok || !payload.data) {
        setError(getImportErrorMessage(payload, t));
        return;
      }

      const data = payload.data as ImportPreview;
      setPreview(data);
      setSelectedPaths(
        new Set(
          data.items
            .filter(
              (item): item is SelectablePlanItem =>
                item.path !== null &&
                (item.action === "create" || item.action === "update"),
            )
            .map((item) => item.path),
        ),
      );
    } catch {
      if (requestRef.current === requestId) {
        setError(t.admin.articleImport.previewFailed);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsParsing(false);
      }
    }
  }

  function addFiles(incoming: File[]) {
    if (isApplying) {
      return;
    }

    const accepted: File[] = [];
    let rejected = false;

    for (const file of incoming) {
      if (!file.name.toLowerCase().endsWith(".md")) {
        rejected = true;
        continue;
      }

      if (
        accepted.some(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        ) ||
        files.some(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        )
      ) {
        continue;
      }

      accepted.push(file);
    }

    const nextFiles = [...files, ...accepted].slice(0, ARTICLE_IMPORT_MAX_FILES);
    setFiles(nextFiles);

    if (nextFiles.length > 0) {
      void loadPreview(nextFiles);
    }

    if (rejected) {
      setNotice(t.admin.articleImport.onlyMarkdown);
    } else if (files.length + accepted.length > ARTICLE_IMPORT_MAX_FILES) {
      setNotice(t.admin.articleImport.errors.tooManyFiles);
    }
  }

  function removeFile(index: number) {
    if (isApplying) {
      return;
    }

    const nextFiles = files.filter((_file, fileIndex) => fileIndex !== index);
    setFiles(nextFiles);

    if (nextFiles.length === 0) {
      requestRef.current += 1;
      setPreview(null);
      setSelectedPaths(new Set());
      setIsParsing(false);
      return;
    }

    void loadPreview(nextFiles);
  }

  function togglePath(path: string) {
    setSelectedPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  function toggleAll() {
    setSelectedPaths((current) => {
      if (
        selectableItems.length > 0 &&
        current.size >= selectableItems.length
      ) {
        return new Set();
      }

      return new Set(selectableItems.map((item) => item.path));
    });
  }

  async function applyImport() {
    if (!preview || selectedPaths.size === 0) {
      setError(t.admin.articleImport.errors.noSelection);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsApplying(true);
    setError(null);

    const formData = buildFormData("apply", files);
    formData.set("paths", JSON.stringify(Array.from(selectedPaths)));

    try {
      const response = await fetch("/api/admin/articles/import", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (requestRef.current !== requestId) {
        return;
      }

      if (!response.ok || !payload.data) {
        setError(getImportErrorMessage(payload, t));
        return;
      }

      setResult(payload.data as ImportApplyResult);
      router.refresh();
    } catch {
      if (requestRef.current === requestId) {
        setError(t.admin.articleImport.applyFailed);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsApplying(false);
      }
    }
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Upload data-icon="inline-start" />
        {t.admin.articleImport.trigger}
      </Button>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && isApplying) {
            return;
          }

          setIsOpen(nextOpen);

          if (!nextOpen) {
            resetState();
          }
        }}
        open={isOpen}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t.admin.articleImport.title}</DialogTitle>
            <DialogDescription>
              {t.admin.articleImport.description}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <p className="text-[13px] font-medium text-foreground">
                  {t.admin.articleImport.resultTitle}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {formatTemplate(t.admin.articleImport.resultSummary, {
                    created: result.created,
                    updated: result.updated,
                    skipped: result.skipped,
                    failed: result.failed,
                  })}
                </p>
              </div>

              {result.failed > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-medium text-destructive">
                    {t.admin.articleImport.failedTitle}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {result.items
                      .filter((item) => item.action === "failed")
                      .map((item) => (
                        <li
                          className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11.5px]"
                          key={`${item.fileName}-${item.path ?? ""}`}
                        >
                          <span className="font-medium">{item.fileName}</span>
                          <span className="block text-destructive">
                            {item.error}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div
                aria-label={t.admin.articleImport.dropzoneTitle}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 px-4 py-7 text-center transition-colors hover:border-primary/40 hover:bg-muted/30",
                  isDragging && "border-primary/60 bg-primary/5",
                )}
                onClick={() => {
                  if (!isApplying) {
                    inputRef.current?.click();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  addFiles(Array.from(event.dataTransfer.files));
                }}
                onKeyDown={(event) => {
                  if (
                    !isApplying &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <input
                  accept=".md,text/markdown,text/plain"
                  className="sr-only"
                  multiple
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                  onClick={(event) => event.stopPropagation()}
                  ref={inputRef}
                  type="file"
                />
                <Upload className="size-5 text-muted-foreground" />
                <p className="text-[12.5px] font-medium text-foreground">
                  {t.admin.articleImport.dropzoneTitle}
                </p>
                <p className="text-[11.5px] text-muted-foreground">
                  {t.admin.articleImport.dropzoneHint}
                </p>
              </div>

              {files.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11.5px] text-muted-foreground">
                      {formatTemplate(t.admin.articleImport.fileCount, {
                        count: files.length,
                      })}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        disabled={isParsing || isApplying}
                        onClick={() => void loadPreview(files)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {isParsing ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Upload />
                        )}
                        {isParsing
                          ? t.admin.articleImport.parsing
                          : t.admin.articleImport.parse}
                      </Button>
                      <Button
                        disabled={isApplying}
                        onClick={() => resetState()}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <X />
                        {t.admin.articleImport.clearAll}
                      </Button>
                    </div>
                  </div>

                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {files.map((file, index) => (
                      <span
                        className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-[11px]"
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      >
                        <FileText className="size-3 text-muted-foreground" />
                        <span className="max-w-48 truncate">{file.name}</span>
                        <span className="text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        <button
                          aria-label={t.common.close}
                          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                          disabled={isApplying}
                          onClick={() => removeFile(index)}
                          type="button"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="article-import-prefix">
                    {t.admin.articleImport.prefixLabel}
                  </Label>
                  <Input
                    id="article-import-prefix"
                    onChange={(event) => {
                      setPrefix(event.target.value);
                      invalidatePreview();
                    }}
                    placeholder={t.admin.articleImport.prefixPlaceholder}
                    value={prefix}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t.admin.articleImport.prefixHint}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="article-import-status">
                    {t.admin.articleImport.statusLabel}
                  </Label>
                  <select
                    className="select-native"
                    id="article-import-status"
                    onChange={(event) => {
                      setStatus(
                        event.target.value === ArticleStatus.DRAFT
                          ? ArticleStatus.DRAFT
                          : ArticleStatus.PUBLISHED,
                      );
                      invalidatePreview();
                    }}
                    value={status}
                  >
                    <option value={ArticleStatus.PUBLISHED}>
                      {t.admin.articleImport.statusPublished}
                    </option>
                    <option value={ArticleStatus.DRAFT}>
                      {t.admin.articleImport.statusDraft}
                    </option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    {t.admin.articleImport.statusHint}
                  </p>
                </div>
              </div>

              {error ? (
                <div
                  className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {notice ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{notice}</span>
                </div>
              ) : null}

              {isParsing ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t.admin.articleImport.parsing}
                </div>
              ) : null}

              {preview ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[12.5px] font-medium text-foreground">
                        {t.admin.articleImport.previewTitle}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.admin.articleImport.previewHint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatTemplate(
                          t.admin.articleImport.selectedCount,
                          {
                            count: selectedPaths.size,
                            total: selectableItems.length,
                          },
                        )}
                      </span>
                      <Button
                        disabled={selectableItems.length === 0}
                        onClick={toggleAll}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {t.admin.articleImport.selectAll}
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span className="w-3.5" />
                      <span>{t.admin.articleImport.columnFile}</span>
                      <span>{t.admin.articleImport.columnAction}</span>
                    </div>
                    <div className="max-h-[40vh] divide-y divide-border/60 overflow-y-auto">
                      {preview.items.map((item, index) => (
                        <ImportPreviewRow
                          item={item}
                          key={`${item.fileName}-${item.path ?? ""}-${index}`}
                          onToggle={togglePath}
                          selectable={
                            item.action === "create" || item.action === "update"
                          }
                          selected={
                            item.path !== null &&
                            selectedPaths.has(item.path)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge variant="success">
                      {t.admin.articleImport.actionCreate}{" "}
                      {preview.summary.create}
                    </Badge>
                    <Badge variant="warning">
                      {t.admin.articleImport.actionUpdate}{" "}
                      {preview.summary.update}
                    </Badge>
                    <Badge variant="secondary">
                      {t.admin.articleImport.actionUnchanged}{" "}
                      {preview.summary.unchanged}
                    </Badge>
                    {preview.summary.error > 0 ? (
                      <Badge variant="destructive">
                        {t.admin.articleImport.actionError}{" "}
                        {preview.summary.error}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button onClick={() => setIsOpen(false)} type="button">
                {t.admin.articleImport.done}
              </Button>
            ) : (
              <>
                <Button
                  disabled={isApplying}
                  onClick={() => setIsOpen(false)}
                  type="button"
                  variant="outline"
                >
                  {t.admin.articleImport.cancel}
                </Button>
                <Button
                  disabled={
                    !preview || selectedPaths.size === 0 || isApplying
                  }
                  onClick={() => void applyImport()}
                  type="button"
                >
                  {isApplying ? <Loader2 className="animate-spin" /> : <Upload />}
                  {isApplying
                    ? t.admin.articleImport.applying
                    : t.admin.articleImport.apply}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportPreviewRow({
  item,
  onToggle,
  selectable,
  selected,
}: {
  item: ImportPlanItem;
  onToggle: (path: string) => void;
  selectable: boolean;
  selected: boolean;
}) {
  const t = useT();
  const pathLabel =
    item.path === null
      ? "—"
      : item.path === ""
        ? t.common.root
        : `/${item.path}`;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2">
      <input
        aria-label={item.title ?? item.fileName}
        checked={selected}
        className="mt-0.5 size-3.5 accent-primary disabled:opacity-40"
        disabled={!selectable}
        onChange={() => {
          if (item.path !== null) {
            onToggle(item.path);
          }
        }}
        type="checkbox"
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[12px] font-medium text-foreground">
            {item.title ?? item.fileName}
          </span>
          <span className="truncate font-mono text-[10.5px] text-muted-foreground">
            {pathLabel}
          </span>
          <Badge
            className="h-4 text-[10px]"
            variant={
              item.status === ArticleStatus.PUBLISHED
                ? "outline"
                : "secondary"
            }
          >
            {item.status === ArticleStatus.PUBLISHED
              ? t.common.published
              : t.common.draft}
          </Badge>
        </div>

        <p className="truncate text-[10.5px] text-muted-foreground">
          {item.fileName}
          {item.warnings.length > 0
            ? ` · ${formatTemplate(t.admin.articleImport.warnings, {
                count: item.warnings.length,
              })}`
            : ""}
        </p>

        {item.warnings.length > 0 ? (
          <ul className="mt-0.5 flex flex-col gap-0.5 text-[10.5px] text-amber-600 dark:text-amber-400">
            {item.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        {item.error ? (
          <p className="mt-0.5 text-[10.5px] text-destructive">{item.error}</p>
        ) : null}

        {item.action === "unchanged" ? (
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {t.admin.articleImport.unchangedHint}
          </p>
        ) : null}
      </div>

      <Badge variant={getActionBadgeVariant(item.action)}>
        {getActionLabel(item.action, t)}
      </Badge>
    </div>
  );
}

function getActionLabel(action: ImportAction, t: ReturnType<typeof useT>) {
  switch (action) {
    case "create":
      return t.admin.articleImport.actionCreate;
    case "update":
      return t.admin.articleImport.actionUpdate;
    case "unchanged":
      return t.admin.articleImport.actionUnchanged;
    case "error":
      return t.admin.articleImport.actionError;
  }
}

function getActionBadgeVariant(action: ImportAction) {
  switch (action) {
    case "create":
      return "success" as const;
    case "update":
      return "warning" as const;
    case "unchanged":
      return "secondary" as const;
    case "error":
      return "destructive" as const;
  }
}

function getImportErrorMessage(
  payload: ApiPayload,
  t: ReturnType<typeof useT>,
) {
  const messages = t.admin.articleImport.errors;

  switch (payload.code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return messages.unauthorized;
    case "NO_FILES":
      return messages.noFiles;
    case "TOO_MANY_FILES":
      return messages.tooManyFiles;
    case "FILE_TOO_LARGE":
      return formatTemplate(messages.fileTooLarge, {
        name: payload.details?.fileName ?? "",
      });
    case "TOTAL_TOO_LARGE":
      return messages.totalTooLarge;
    case "INVALID_PREFIX":
      return messages.invalidPrefix;
    case "INVALID_STATUS":
      return messages.invalidStatus;
    case "NO_SELECTION":
      return messages.noSelection;
    default:
      return messages.failed;
  }
}
