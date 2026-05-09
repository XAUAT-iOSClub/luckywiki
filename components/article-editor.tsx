"use client";

import type { ChangeEvent, ClipboardEvent } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ImageUp,
  Loader2,
  Eye,
  Edit3,
  Hash,
  Link2,
  FileText,
  Type,
  User,
} from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormActionState } from "@/app/actions/admin";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

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
      console.error(
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
    <form action={formAction} className="flex flex-col gap-8">
      {/* Top Metadata Bar - Horizontal Layout */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-6 rounded-[2rem] border border-border/40 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl shadow-sm">
        <div className="flex flex-col gap-1.5 md:col-span-2 lg:col-span-1">
          <Label
            htmlFor="title"
            className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70"
          >
            {t.common.title}
          </Label>
          <div className="relative">
            <Type className="absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              required
              id="title"
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t.common.title}
              value={title}
              className="h-9 rounded-xl border-border/50 bg-background/50 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">
            {t.common.status}
          </Label>
          <Select
            name="status"
            onValueChange={(value) => setStatus(value as ArticleStatus)}
            value={status}
          >
            <SelectTrigger id="status" className="h-9 rounded-xl bg-background/50 border-border/50 text-xs">
              <SelectValue placeholder={t.common.status} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value={ArticleStatus.DRAFT}>{t.common.draft}</SelectItem>
              <SelectItem value={ArticleStatus.PUBLISHED}>{t.common.published}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="path" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">
            {t.common.path}
          </Label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
            <Input
              id="path"
              required
              name="path"
              onChange={(event) => setPath(event.target.value)}
              placeholder={t.admin.articleEditor.pathPlaceholder}
              value={path}
              className="h-9 pl-8 rounded-xl bg-background/50 border-border/50 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tags" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">
            {t.common.tags}
          </Label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
            <Input
              id="tags"
              name="tags"
              onChange={(event) => setTags(event.target.value)}
              placeholder={t.admin.articleEditor.tagsPlaceholder}
              value={tags}
              className="h-9 pl-8 rounded-xl bg-background/50 border-border/50 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="editor" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">
            {t.common.editor}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
            <Input
              id="editor"
              name="editor"
              onChange={(event) => setEditor(event.target.value)}
              placeholder={t.admin.articleEditor.editorPlaceholder}
              value={editor}
              className="h-9 pl-8 rounded-xl bg-background/50 border-border/50 text-xs"
            />
          </div>
        </div>
      </section>

      {/* Main Working Area: Editor & Comparison Preview */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 px-1">
          <Label htmlFor="description" className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <FileText className="size-3.5" />
            {t.common.description}
          </Label>
          <Textarea
            id="description"
            className="min-h-16 rounded-2xl bg-white/40 dark:bg-zinc-900/40 border-border/40 focus-visible:ring-primary/20 resize-none text-sm py-3"
            maxLength={280}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.admin.articleEditor.descriptionPlaceholder}
            value={description}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-0 lg:divide-x divide-border/20 rounded-[2.5rem] border border-border/40 bg-white/60 dark:bg-zinc-900/60 shadow-2xl shadow-black/5 overflow-hidden backdrop-blur-2xl">
          {/* Markdown Editor Side */}
          <div className="flex flex-col min-h-[700px]">
            <div className="flex items-center justify-between p-4 border-b border-border/20 bg-white/20 dark:bg-black/10">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <Edit3 className="size-3" />
                Markdown
              </span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageInputChange}
                  type="file"
                />
                <Button
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-tight hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  {isUploadingImage ? (
                    <Loader2 className="size-3 animate-spin mr-1.5" />
                  ) : (
                    <ImageUp className="size-3 mr-1.5" />
                  )}
                  {isUploadingImage ? "..." : t.admin.articleEditor.insertImage}
                </Button>
              </div>
            </div>
            <div className="flex-1 flex flex-col p-2">
              <Textarea
                className="flex-1 font-mono text-sm leading-relaxed border-none focus-visible:ring-0 bg-transparent resize-none p-6 selection:bg-primary/20"
                onPaste={handleMarkdownPaste}
                name="markdown"
                ref={markdownRef}
                onChange={(event) => setMarkdown(event.target.value)}
                placeholder={t.admin.articleEditor.markdownPlaceholder}
                value={markdown}
              />
              <div className="px-6 py-3 border-t border-border/10 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground/50 italic">
                  {t.admin.articleEditor.imageUploadHint}
                </p>
                <span className="text-[10px] font-mono text-muted-foreground/40 uppercase">
                  {markdown.length} chars
                </span>
              </div>
            </div>
          </div>

          {/* Preview Side */}
          <div className="flex flex-col min-h-175 bg-slate-50/30 dark:bg-zinc-950/20">
            <div className="flex items-center p-4 border-b border-border/20 bg-white/20 dark:bg-black/10">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <Eye className="size-3" />
                Live Preview
              </span>
            </div>
            <div className="flex-1 p-8 overflow-auto">
              <MarkdownRenderer
                linkToSectionLabel={t.common.linkToSection}
                markdown={markdown || t.admin.articleEditor.previewFallback}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Fixed Bottom Action Bar */}
      <div className="sticky bottom-8 self-center z-50">
        <div className="flex items-center gap-3 p-2 rounded-full border border-border/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl shadow-2xl">
          <SubmitButton>{submitLabel}</SubmitButton>
          
          {(state.error || state.success) && (
            <div className={cn(
              "px-4 py-2 rounded-full text-xs font-medium max-w-xs truncate",
              state.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"
            )}>
              {state.error || state.success}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
