"use client";

import type { ChangeEvent, ClipboardEvent } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, LoaderCircle } from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/app/actions/admin";
import { useT } from "@/lib/i18n/provider";

type ArticleEditorProps = {
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  initialState: FormActionState;
  initialValues?: {
    title: string;
    path: string;
    description: string | null;
    tags: string[];
    editor: string | null;
    markdown: string;
    status: ArticleStatus;
  };
  submitLabel: string;
};

export function ArticleEditor({
  action,
  initialState,
  initialValues,
  submitLabel,
}: ArticleEditorProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initialState);
  const t = useT();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [path, setPath] = useState(initialValues?.path ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [tags, setTags] = useState(initialValues?.tags.join(", ") ?? "");
  const [editor, setEditor] = useState(initialValues?.editor ?? "");
  const [markdown, setMarkdown] = useState(initialValues?.markdown ?? "");
  const [status, setStatus] = useState<ArticleStatus>(
    initialValues?.status ?? ArticleStatus.DRAFT,
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownRef = useRef<HTMLTextAreaElement | null>(null);

  const imageUploadMessages = {
    FILE_TOO_LARGE: t.admin.articleEditor.uploadErrors.fileTooLarge,
    INVALID_FILE_TYPE: t.admin.articleEditor.uploadErrors.invalidFileType,
    MISSING_FILE: t.admin.articleEditor.uploadErrors.missingFile,
    UNAUTHORIZED: t.admin.articleEditor.uploadErrors.unauthorized,
    UPLOAD_FAILED: t.admin.articleEditor.uploadErrors.uploadFailed,
    UPLOAD_NOT_CONFIGURED: t.admin.articleEditor.uploadErrors.uploadNotConfigured,
  } as const;

  useEffect(() => {
    if (state.success?.startsWith("/")) {
      router.push(state.success);
      router.refresh();
    }
  }, [router, state.success]);

  function insertMarkdownAtCursor(snippet: string) {
    setMarkdown((currentMarkdown) => {
      const textarea = markdownRef.current;
      const selectionStart = textarea?.selectionStart ?? currentMarkdown.length;
      const selectionEnd = textarea?.selectionEnd ?? currentMarkdown.length;
      const before = currentMarkdown.slice(0, selectionStart);
      const after = currentMarkdown.slice(selectionEnd);
      const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
      const needsTrailingNewline = after.length > 0 && !after.startsWith("\n");
      const insertedSnippet = `${needsLeadingNewline ? "\n" : ""}${snippet}${needsTrailingNewline ? "\n" : ""}`;
      const nextMarkdown = `${before}${insertedSnippet}${after}`;

      requestAnimationFrame(() => {
        if (!textarea) {
          return;
        }

        const caret = before.length + insertedSnippet.length;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });

      return nextMarkdown;
    });
  }

  async function uploadImage(file: File) {
    setIsUploadingImage(true);
    setImageUploadError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("alt", file.name.replace(/\.[^.]+$/u, ""));

      const response = await fetch("/api/uploads/images", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as {
        code?: keyof typeof imageUploadMessages;
        error?: string;
        markdown?: string;
      };

      if (!response.ok || !payload.markdown) {
        const message =
          (payload.code ? imageUploadMessages[payload.code] : undefined) ??
          payload.error ??
          t.feedback.somethingWentWrong;

        throw new Error(message);
      }

      insertMarkdownAtCursor(payload.markdown);
    } catch (error) {
      setImageUploadError(
        error instanceof Error ? error.message : t.feedback.somethingWentWrong,
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await uploadImage(file);
  }

  async function handleMarkdownPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();

    if (!file) {
      return;
    }

    event.preventDefault();
    await uploadImage(file);
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="field-block">
          <span>{t.common.title}</span>
          <input
            required
            className="field-input"
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.admin.articleEditor.titlePlaceholder}
            value={title}
          />
        </label>
        <label className="field-block">
          <span>{t.common.status}</span>
          <select
            className="field-input"
            name="status"
            onChange={(event) => setStatus(event.target.value as ArticleStatus)}
            value={status}
          >
            <option value={ArticleStatus.DRAFT}>{t.common.draft}</option>
            <option value={ArticleStatus.PUBLISHED}>{t.common.published}</option>
          </select>
        </label>
      </div>

      <label className="field-block">
        <span>{t.common.path}</span>
        <input
          required
          className="field-input"
          name="path"
          onChange={(event) => setPath(event.target.value)}
          placeholder={t.admin.articleEditor.pathPlaceholder}
          value={path}
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="field-block">
          <span>{t.common.description}</span>
          <textarea
            className="field-textarea min-h-28"
            maxLength={280}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.admin.articleEditor.descriptionPlaceholder}
            value={description}
          />
        </label>
        <div className="grid gap-4">
          <label className="field-block">
            <span>{t.common.tags}</span>
            <input
              className="field-input"
              name="tags"
              onChange={(event) => setTags(event.target.value)}
              placeholder={t.admin.articleEditor.tagsPlaceholder}
              value={tags}
            />
          </label>
          <label className="field-block">
            <span>{t.common.editor}</span>
            <input
              className="field-input"
              name="editor"
              onChange={(event) => setEditor(event.target.value)}
              placeholder={t.admin.articleEditor.editorPlaceholder}
              value={editor}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <label className="field-block">
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageInputChange}
            type="file"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t.common.markdown}</span>
            <Button
              disabled={isUploadingImage}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              {isUploadingImage ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ImageUp />
              )}
              {isUploadingImage
                ? t.admin.articleEditor.uploadingImage
                : t.admin.articleEditor.insertImage}
            </Button>
          </div>
          <textarea
            className="field-textarea min-h-[480px]"
            onPaste={handleMarkdownPaste}
            name="markdown"
            ref={markdownRef}
            onChange={(event) => setMarkdown(event.target.value)}
            placeholder={t.admin.articleEditor.markdownPlaceholder}
            value={markdown}
          />
          <p className="text-sm text-muted-foreground">
            {t.admin.articleEditor.imageUploadHint}
          </p>
          {imageUploadError ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {imageUploadError}
            </p>
          ) : null}
        </label>
        <div className="field-block">
          <span>{t.common.preview}</span>
          <div className="rounded-3xl border border-border/70 bg-white/80 dark:bg-zinc-900/60 p-5">
            <MarkdownRenderer
              linkToSectionLabel={t.common.linkToSection}
              markdown={markdown || t.admin.articleEditor.previewFallback}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {state.error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.success && !state.success.startsWith("/") ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
