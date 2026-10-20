"use client";

import type { ChangeEvent, ClipboardEvent } from "react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  AlertCircle,
  ImageUp,
  Loader2,
  Eye,
  Edit3,
  History,
  Link2,
  Sparkles,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Table as TableIcon,
  Minus,
  Settings2,
  Layout,
  X,
  FolderOpen,
} from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { HtmlPreview } from "@/components/html-preview";
import { PathPicker } from "@/components/path-picker";
import { MediaPicker } from "@/components/admin/media-picker";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { FormActionState } from "@/app/actions/admin";
import {
  MAX_SUMMARY_DESCRIPTION_CHARS,
  MAX_SUMMARY_INPUT_MARKDOWN_CHARS,
  type ArticleSummaryAction,
} from "@/lib/articles/summary-contract";
import { useT } from "@/lib/i18n/provider";
import { buildImageHtml, buildImageMarkdown } from "@/lib/media/markdown";
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
  summaryAction?: ArticleSummaryAction;
  submitLabel: string;
  historyHref?: string;
};

export function ArticleEditor({
  action,
  initialState,
  initialValues,
  summaryAction,
  submitLabel,
  historyHref,
}: ArticleEditorProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initialState);
  const t = useT();
  const { resolvedTheme } = useTheme();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [path, setPath] = useState(initialValues?.path ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [tags, setTags] = useState(initialValues?.tags.join(", ") ?? "");
  const [editorName, setEditorName] = useState(initialValues?.editor ?? "markdown");
  const [markdown, setMarkdown] = useState(initialValues?.markdown ?? "");
  const [status, setStatus] = useState<ArticleStatus>(
    initialValues?.status ?? ArticleStatus.DRAFT,
  );
  const [isPathPickerOpen, setIsPathPickerOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryIsAi, setSummaryIsAi] = useState(false);
  const [isConfirmingSummaryOverwrite, setIsConfirmingSummaryOverwrite] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const isHtmlEditor = editorName === "html";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const monacoEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Sync scroll: editor → preview
  const syncEditorToPreview = useCallback(() => {
    const monacoEditor = monacoEditorRef.current;
    const preview = previewContainerRef.current;
    if (!monacoEditor || !preview || isSyncingRef.current) return;

    const visibleRanges = monacoEditor.getVisibleRanges();
    if (visibleRanges.length === 0) return;

    const topVisibleLine = visibleRanges[0].startLineNumber;
    const model = monacoEditor.getModel();
    if (!model) return;

    if (topVisibleLine <= 1) {
      preview.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const editorScrollTop = monacoEditor.getScrollTop();
    const editorScrollHeight = monacoEditor.getScrollHeight();
    const editorClientHeight = monacoEditor.getLayoutInfo().height;

    if (editorScrollTop + editorClientHeight >= editorScrollHeight - 5) {
      preview.scrollTo({ top: preview.scrollHeight - preview.clientHeight, behavior: "auto" });
      return;
    }

    const previewElements = preview.querySelectorAll("[data-line]");
    let targetElement: HTMLElement | null = null;
    let prevElement: HTMLElement | null = null;

    for (let i = 0; i < previewElements.length; i++) {
      const el = previewElements[i] as HTMLElement;
      const line = parseInt(el.getAttribute("data-line") || "0", 10);
      if (line >= topVisibleLine) {
        targetElement = el;
        break;
      }
      prevElement = el;
    }

    if (targetElement) {
      const targetLine = parseInt(targetElement.getAttribute("data-line") || "0", 10);
      const prevLine = prevElement ? parseInt(prevElement.getAttribute("data-line") || "0", 10) : 1;

      const containerRect = preview.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const targetTop = targetRect.top - containerRect.top + preview.scrollTop;

      let offset = 0;
      if (targetLine !== prevLine && prevElement) {
        const prevRect = prevElement.getBoundingClientRect();
        const prevTop = prevRect.top - containerRect.top + preview.scrollTop;
        const ratio = (topVisibleLine - prevLine) / (targetLine - prevLine);
        offset = prevTop + ratio * (targetTop - prevTop);
      } else {
        offset = targetTop;
      }

      preview.scrollTop = offset - 40;
    }
  }, []);

  // Sync scroll: preview → editor
  const syncPreviewToEditor = useCallback(() => {
    const monacoEditor = monacoEditorRef.current;
    const preview = previewContainerRef.current;
    if (!monacoEditor || !preview || isSyncingRef.current) return;

    const previewScrollTop = preview.scrollTop;
    const previewScrollHeight = preview.scrollHeight;
    const previewClientHeight = preview.clientHeight;

    if (previewScrollTop <= 5) {
      monacoEditor.setScrollTop(0);
      return;
    }

    const editorScrollHeight = monacoEditor.getScrollHeight();
    const editorClientHeight = monacoEditor.getLayoutInfo().height;

    if (previewScrollTop + previewClientHeight >= previewScrollHeight - 5) {
      monacoEditor.setScrollTop(editorScrollHeight - editorClientHeight);
      return;
    }

    const previewElements = preview.querySelectorAll("[data-line]");
    let topElement: HTMLElement | null = null;
    let bottomElement: HTMLElement | null = null;

    for (let i = 0; i < previewElements.length; i++) {
      const el = previewElements[i] as HTMLElement;
      const containerRect = preview.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - containerRect.top;

      if (elTop >= 0) {
        bottomElement = el;
        break;
      }
      topElement = el;
    }

    if (bottomElement) {
      const topLine = topElement ? parseInt(topElement.getAttribute("data-line") || "1", 10) : 1;
      const bottomLine = parseInt(bottomElement.getAttribute("data-line") || "1", 10);

      const containerRect = preview.getBoundingClientRect();
      const topRect = topElement ? topElement.getBoundingClientRect() : { top: containerRect.top };
      const bottomRect = bottomElement.getBoundingClientRect();

      const topPos = topRect.top - containerRect.top;
      const bottomPos = bottomRect.top - containerRect.top;

      const ratio = bottomPos !== topPos ? (0 - topPos) / (bottomPos - topPos) : 0;
      const targetLine = topLine + ratio * (bottomLine - topLine);

      const model = monacoEditor.getModel();
      if (model) {
        const totalLines = model.getLineCount();
        const lineHeight = editorScrollHeight / totalLines;
        monacoEditor.setScrollTop((targetLine - 1) * lineHeight);
      }
    }
  }, []);

  const handlePreviewScroll = useCallback(() => {
    if (mode !== "split" || isSyncingRef.current) return;
    isSyncingRef.current = true;
    syncPreviewToEditor();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    });
  }, [mode, syncPreviewToEditor]);

  const imageUploadMessages = {
    FILE_TOO_LARGE: t.admin.articleEditor.uploadErrors.fileTooLarge,
    INVALID_FILE_TYPE: t.admin.articleEditor.uploadErrors.invalidFileType,
    MISSING_FILE: t.admin.articleEditor.uploadErrors.missingFile,
    UNAUTHORIZED: t.admin.articleEditor.uploadErrors.unauthorized,
    UPLOAD_FAILED: t.admin.articleEditor.uploadErrors.uploadFailed,
    UPLOAD_NOT_CONFIGURED: t.admin.articleEditor.uploadErrors.uploadNotConfigured,
  } as const;

  function handleDescriptionChange(value: string) {
    setDescription(value);
    setSummaryIsAi(false);
    setSummaryError(null);
    setIsConfirmingSummaryOverwrite(false);
  }

  async function requestSummary(force = false) {
    if (!summaryAction || isGeneratingSummary) {
      return;
    }

    if (description.trim() && !force) {
      setIsConfirmingSummaryOverwrite(true);
      return;
    }

    setIsConfirmingSummaryOverwrite(false);
    setIsGeneratingSummary(true);
    setSummaryError(null);

    try {
      const result = await summaryAction({
        title: title.trim(),
        markdown: markdown.slice(0, MAX_SUMMARY_INPUT_MARKDOWN_CHARS),
      });

      if ("summary" in result) {
        setDescription(result.summary);
        setSummaryIsAi(true);
      } else {
        setSummaryError(result.error);
      }
    } catch {
      setSummaryError(t.feedback.somethingWentWrong);
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  useEffect(() => {
    if (state.success?.startsWith("/")) {
      router.push(state.success);
      router.refresh();
    }
  }, [router, state.success]);

  const insertMarkdownAtCursor = useCallback((snippet: string) => {
    const monacoEditor = monacoEditorRef.current;
    if (!monacoEditor) {
      setMarkdown((prev) => prev + snippet);
      return;
    }

    const selection = monacoEditor.getSelection();
    if (!selection) return;

    const model = monacoEditor.getModel();
    if (!model) return;

    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: selection.startLineNumber,
      endColumn: selection.startColumn,
    });
    const after = model.getValueInRange({
      startLineNumber: selection.endLineNumber,
      startColumn: selection.endColumn,
      endLineNumber: model.getLineCount(),
      endColumn: model.getLineMaxColumn(model.getLineCount()),
    });

    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const needsTrailingNewline = after.length > 0 && !after.startsWith("\n");
    const insertedSnippet = `${needsLeadingNewline ? "\n" : ""}${snippet}${needsTrailingNewline ? "\n" : ""}`;

    monacoEditor.executeEdits("insert", [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn,
        },
        text: insertedSnippet,
      },
    ]);

    const insertLines = insertedSnippet.split("\n");
    const lastLineLength = insertLines[insertLines.length - 1].length;
    const endLineNumber = selection.startLineNumber + insertLines.length - 1;
    const endColumn = insertLines.length === 1 ? selection.startColumn + lastLineLength : lastLineLength + 1;

    monacoEditor.setSelection({
      startLineNumber: endLineNumber,
      startColumn: endColumn,
      endLineNumber: endLineNumber,
      endColumn: endColumn,
    });
    monacoEditor.focus();
  }, []);

  const insertCodeAtCursor = useCallback((snippet: string) => {
    const monacoEditor = monacoEditorRef.current;
    if (!monacoEditor) {
      setMarkdown((prev) => prev + snippet);
      return;
    }

    const selection = monacoEditor.getSelection();
    if (!selection) return;

    const model = monacoEditor.getModel();
    if (!model) return;

    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: selection.startLineNumber,
      endColumn: selection.startColumn,
    });
    const after = model.getValueInRange({
      startLineNumber: selection.endLineNumber,
      startColumn: selection.endColumn,
      endLineNumber: model.getLineCount(),
      endColumn: model.getLineMaxColumn(model.getLineCount()),
    });

    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const needsTrailingNewline = after.length > 0 && !after.startsWith("\n");
    const insertedSnippet = `${needsLeadingNewline ? "\n" : ""}${snippet}${needsTrailingNewline ? "\n" : ""}`;

    monacoEditor.executeEdits("insert", [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn,
        },
        text: insertedSnippet,
      },
    ]);

    const insertLines = insertedSnippet.split("\n");
    const lastLineLength = insertLines[insertLines.length - 1].length;
    const endLineNumber = selection.startLineNumber + insertLines.length - 1;
    const endColumn = insertLines.length === 1 ? selection.startColumn + lastLineLength : lastLineLength + 1;

    monacoEditor.setSelection({
      startLineNumber: endLineNumber,
      startColumn: endColumn,
      endLineNumber: endLineNumber,
      endColumn: endColumn,
    });
    monacoEditor.focus();
  }, []);

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

      if (editorName === "html") {
        const urlMatch = payload.markdown.match(/\((https?:\/\/[^\s)]+)\)/);
        const altMatch = payload.markdown.match(/!\[([^\]]*)\]/);
        const imgUrl = urlMatch?.[1] ?? payload.markdown;
        const imgAlt = altMatch?.[1] ?? file.name.replace(/\.[^.]+$/u, "");
        insertMarkdownAtCursor(`<img src="${imgUrl}" alt="${imgAlt}" />`);
      } else {
        insertMarkdownAtCursor(payload.markdown);
      }
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : t.feedback.somethingWentWrong,
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handlePathSelect(selectedPath: string) {
    const segments = path.split("/").filter(Boolean);
    const currentSlug = segments[segments.length - 1] || "";
    const newPath = selectedPath ? `${selectedPath}/${currentSlug}` : currentSlug;
    setPath(newPath);
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
    <form action={formAction} className="relative flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background">
      {/* Hidden inputs for metadata to be included in form submission */}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="tags" value={tags} />
      <input type="hidden" name="editor" value={editorName} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="markdown" value={markdown} />

      {/* Main Working Area: Editor & Preview */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Unified Header Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/70 px-3 py-2 backdrop-blur-xl">
          {/* Left: Tools */}
          <div className="flex items-center gap-2">
            {isHtmlEditor ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<h1 class="text-3xl font-bold"></h1>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  H1
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<h2 class="text-2xl font-semibold"></h2>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  H2
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<h3 class="text-xl font-medium"></h3>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  H3
                </Button>
                <div className="mx-1 h-4 w-px bg-border/60" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<p class="text-base leading-relaxed"></p>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  P
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<p class="text-sm text-zinc-500 dark:text-zinc-400"></p>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Text
                </Button>
                <div className="mx-1 h-4 w-px bg-border/60" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<div class="flex items-center gap-4">
  <div class="flex-1"></div>
  <div class="flex-1"></div>
</div>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Flex
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
  <div></div>
  <div></div>
  <div></div>
</div>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Grid
                </Button>
                <div className="mx-1 h-4 w-px bg-border/60" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<div class="rounded-xl bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700 p-6">
</div>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Card
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertCodeAtCursor(`<button class="px-4 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
  Button
</button>`)}
                  className="h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Btn
                </Button>
              </div>
            ) : (
              <Menubar className="h-8 gap-0.5 rounded-md border-0 bg-transparent p-0">
              <MenubarMenu>
                <MenubarTrigger className="h-7 rounded-md px-2.5 text-[12px] font-medium tracking-normal text-muted-foreground">
                  <Heading1 className="size-3.5 mr-1.5" /> {t.admin.articleEditor.menubar.headings}
                </MenubarTrigger>
                <MenubarContent className="rounded-lg">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("# ")} className="text-[12.5px]">
                    <Heading1 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading1}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("## ")} className="text-[12.5px]">
                    <Heading2 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading2}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("### ")} className="text-[12.5px]">
                    <Heading3 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading3}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 rounded-md px-2.5 text-[12px] font-medium tracking-normal text-muted-foreground">
                  {t.admin.articleEditor.menubar.format}
                </MenubarTrigger>
                <MenubarContent className="rounded-lg">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("**Bold Text**")} className="text-[12.5px]">
                    <Bold className="size-4 mr-2" /> {t.admin.articleEditor.menubar.bold}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("*Italic Text*")} className="text-[12.5px]">
                    <Italic className="size-4 mr-2" /> {t.admin.articleEditor.menubar.italic}
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem onClick={() => insertMarkdownAtCursor("> Quote")} className="text-[12.5px]">
                    <Quote className="size-4 mr-2" /> {t.admin.articleEditor.menubar.blockquote}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("---")} className="text-[12.5px]">
                    <Minus className="size-4 mr-2" /> {t.admin.articleEditor.menubar.separator}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 rounded-md px-2.5 text-[12px] font-medium tracking-normal text-muted-foreground">
                  {t.admin.articleEditor.menubar.list}
                </MenubarTrigger>
                <MenubarContent className="rounded-lg">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("- Item")} className="text-[12.5px]">
                    <List className="size-4 mr-2" /> {t.admin.articleEditor.menubar.bulletList}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("1. Item")} className="text-[12.5px]">
                    <ListOrdered className="size-4 mr-2" /> {t.admin.articleEditor.menubar.numberedList}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 rounded-md px-2.5 text-[12px] font-medium tracking-normal text-muted-foreground">
                  {t.admin.articleEditor.menubar.insert}
                </MenubarTrigger>
                <MenubarContent className="rounded-lg">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("```\nCode Block\n```")} className="text-[12.5px]">
                    <Code className="size-4 mr-2" /> {t.admin.articleEditor.menubar.codeBlock}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("| Header | Header |\n| --- | --- |\n| Cell | Cell |")} className="text-[12.5px]">
                    <TableIcon className="size-4 mr-2" /> {t.admin.articleEditor.menubar.table}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("[Link Text](url)")} className="text-[12.5px]">
                    <Link2 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.link}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
            )}

            <div className="mx-1 hidden h-4 w-px bg-border/60 sm:block" />

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
              className="hidden h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
            >
              {isUploadingImage ? (
                <Loader2 className="size-3.5 animate-spin mr-2" />
              ) : (
                <ImageUp className="size-3.5 mr-2" />
              )}
              {isUploadingImage ? "..." : t.admin.articleEditor.insertImage}
            </Button>
            <MediaPicker
              disabled={isUploadingImage}
              onSelect={(asset) => {
                const altText =
                  asset.altText || asset.fileName.replace(/\.[^.]+$/u, "");

                insertMarkdownAtCursor(
                  editorName === "html"
                    ? buildImageHtml(asset.url, altText)
                    : buildImageMarkdown(asset.url, altText),
                );
              }}
              triggerClassName="hidden h-7 rounded-md px-2.5 text-[11px] font-medium tracking-normal text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
            />
          </div>

          {/* Center: Mode Switcher */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("edit")}
              className={cn(
                "h-7 rounded-[5px] px-2.5 text-[11px] font-medium text-muted-foreground",
                mode === "edit" && "bg-card text-foreground hover:bg-card",
              )}
              title={t.common.editor}
            >
              <Edit3 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("split")}
              className={cn(
                "hidden h-7 rounded-[5px] px-2.5 text-[11px] font-medium text-muted-foreground lg:flex",
                mode === "split" && "bg-card text-foreground hover:bg-card",
              )}
              title={t.common.preview}
            >
              <Layout />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("preview")}
              className={cn(
                "h-7 rounded-[5px] px-2.5 text-[11px] font-medium text-muted-foreground",
                mode === "preview" && "bg-card text-foreground hover:bg-card",
              )}
              title={t.common.preview}
            >
              <Eye />
            </Button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            {(state.error || state.success) && (
              <div
                className={cn(
                  "hidden max-w-[220px] truncate text-[12px] lg:block",
                  state.error
                    ? "text-destructive"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {state.error || state.success}
              </div>
            )}

            {historyHref ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-[12px]"
              >
                <Link href={historyHref}>
                  <History data-icon="inline-start" />
                  <span className="hidden sm:inline">
                    {t.admin.revisionHistory.history}
                  </span>
                </Link>
              </Button>
            ) : null}

            <Drawer direction="right">
              <DrawerTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[12px]">
                  <Settings2 data-icon="inline-start" />
                  <span className="hidden sm:inline">
                    {t.admin.articleEditor.articleSettings}
                  </span>
                </Button>
              </DrawerTrigger>
              <DrawerContent className="w-full border-l border-border/60 bg-card shadow-none sm:max-w-[380px]">
                <DrawerClose asChild>
                  <Button
                    aria-label={t.common.close}
                    className="absolute right-3 top-3 text-muted-foreground"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </DrawerClose>
                <DrawerHeader className="px-5 pb-4 pr-12 pt-6">
                  <DrawerTitle className="text-[16px] font-semibold tracking-[-0.01em]">
                    {t.admin.articleEditor.articleSettings}
                  </DrawerTitle>
                  <DrawerDescription className="text-[12.5px] leading-5">
                    {t.admin.articleEditor.articleSettingsDescription}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="flex max-h-[calc(100dvh-11rem)] flex-col gap-5 overflow-y-auto px-5 pb-8">
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="drawer-title"
                      className="text-[12px] font-medium text-foreground"
                    >
                      {t.common.title}
                    </Label>
                    <Input
                      id="drawer-title"
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t.common.title}
                      value={title}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="drawer-status"
                      className="text-[12px] font-medium text-foreground"
                    >
                      {t.common.status}
                    </Label>
                    <Select
                      onValueChange={(value) => setStatus(value as ArticleStatus)}
                      value={status}
                    >
                      <SelectTrigger id="drawer-status">
                        <SelectValue placeholder={t.common.status} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ArticleStatus.DRAFT}>
                          {t.common.draft}
                        </SelectItem>
                        <SelectItem value={ArticleStatus.PUBLISHED}>
                          {t.common.published}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="drawer-path"
                      className="text-[12px] font-medium text-foreground"
                    >
                      {t.common.path}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        id="drawer-path"
                        onChange={(event) => setPath(event.target.value)}
                        placeholder={t.admin.articleEditor.pathPlaceholder}
                        value={path}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsPathPickerOpen(true)}
                        className="size-8 shrink-0"
                        title={t.admin.articleEditor.pathPicker.pickParent}
                      >
                        <FolderOpen />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="drawer-tags"
                      className="text-[12px] font-medium text-foreground"
                    >
                      {t.common.tags}
                    </Label>
                    <Input
                      id="drawer-tags"
                      onChange={(event) => setTags(event.target.value)}
                      placeholder={t.admin.articleEditor.tagsPlaceholder}
                      value={tags}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="drawer-editor"
                      className="text-[12px] font-medium text-foreground"
                    >
                      {t.common.editor}
                    </Label>
                    <Select onValueChange={setEditorName} value={editorName}>
                      <SelectTrigger id="drawer-editor">
                        <SelectValue
                          placeholder={t.admin.articleEditor.editorPlaceholder}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">
                          {t.common.markdown}
                        </SelectItem>
                        <SelectItem value="html">{t.common.html}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label
                        htmlFor="drawer-description"
                        className="text-[12px] font-medium text-foreground"
                      >
                        {t.admin.articleEditor.summaryLabel}
                      </Label>
                      {summaryAction ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void requestSummary()}
                          disabled={
                            isGeneratingSummary || markdown.trim().length === 0
                          }
                          aria-busy={isGeneratingSummary}
                          className="h-7 px-2 text-[11px]"
                        >
                          {isGeneratingSummary ? (
                            <Loader2 data-icon="inline-start" className="animate-spin" />
                          ) : (
                            <Sparkles data-icon="inline-start" />
                          )}
                          <span>
                            {isGeneratingSummary
                              ? t.admin.articleEditor.summaryGenerating
                              : description.trim()
                                ? t.admin.articleEditor.summaryRegenerate
                                : t.admin.articleEditor.summaryGenerate}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                    <Textarea
                      id="drawer-description"
                      className="min-h-28 resize-none leading-6"
                      maxLength={MAX_SUMMARY_DESCRIPTION_CHARS}
                      onChange={(event) =>
                        handleDescriptionChange(event.target.value)
                      }
                      placeholder={t.admin.articleEditor.descriptionPlaceholder}
                      value={description}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {description.length}/{MAX_SUMMARY_DESCRIPTION_CHARS}
                      </span>
                      {summaryIsAi ? (
                        <Badge variant="secondary">
                          {t.admin.articleEditor.summaryAiBadge}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[11.5px] leading-4 text-muted-foreground">
                      {t.admin.articleEditor.summaryHint}
                    </p>
                    {isConfirmingSummaryOverwrite ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px]">
                        <p className="text-muted-foreground">
                          {t.admin.articleEditor.summaryOverwritePrompt}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void requestSummary(true)}
                            disabled={isGeneratingSummary}
                          >
                            {t.admin.articleEditor.summaryOverwriteConfirm}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setIsConfirmingSummaryOverwrite(false)
                            }
                            disabled={isGeneratingSummary}
                          >
                            {t.admin.articleEditor.summaryCancel}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {summaryError ? (
                      <p
                        role="alert"
                        className="flex items-start gap-1.5 text-[12px] text-destructive"
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{summaryError}</span>
                      </p>
                    ) : null}
                    {summaryAction ? (
                      <p className="text-[11.5px] leading-4 text-muted-foreground">
                        {t.admin.articleEditor.summaryPrivacyHint}
                      </p>
                    ) : null}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            <SubmitButton className="h-8 px-4 text-[12px] font-medium">
              {submitLabel}
            </SubmitButton>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border/60">
          {/* Markdown Editor Side */}
          <div className={cn(
            "flex flex-col min-h-0",
            mode === "preview" && "hidden",
            mode === "edit" && "lg:col-span-2"
          )}>
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 min-h-0">
                  <Editor
                    defaultLanguage={isHtmlEditor ? "html" : "markdown"}
                    value={markdown}
                    onChange={(value) => setMarkdown(value ?? "")}
                    onMount={(editor, _monaco) => {
                      monacoEditorRef.current = editor;

                      if (!isHtmlEditor) {
                        editor.onDidScrollChange(() => {
                          if (modeRef.current !== "split" || isSyncingRef.current) return;
                          isSyncingRef.current = true;
                          syncEditorToPreview();
                          window.requestAnimationFrame(() => {
                            window.requestAnimationFrame(() => {
                              isSyncingRef.current = false;
                            });
                          });
                        });
                      }

                      editor.getContainerDomNode()?.addEventListener("paste", (e) => {
                        handleMarkdownPaste(e as unknown as ClipboardEvent<HTMLTextAreaElement>);
                      });
                    }}
                    theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                    options={{
                      wordWrap: "on",
                      minimap: { enabled: false },
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      fontSize: 13,
                      lineHeight: 22,
                      fontFamily: '"SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace',
                      renderWhitespace: "selection",
                      padding: { top: 16, bottom: 16 },
                      lineNumbersMinChars: 3,
                      glyphMargin: false,
                      folding: true,
                      lineDecorationsWidth: 0,
                      scrollbar: {
                        verticalScrollbarSize: 8,
                        horizontalScrollbarSize: 8,
                      },
                    }}
                    loading={
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <Loader2 className="size-5 animate-spin mr-2" />
                        Loading editor...
                      </div>
                    }
                  />
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/60 px-4 py-2">
                  <p className="truncate text-[11px] text-muted-foreground">
                    {isHtmlEditor
                      ? t.admin.articleEditor.htmlImageUploadHint
                      : t.admin.articleEditor.imageUploadHint}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                    {markdown.length} chars
                  </span>
                </div>
              </div>
            </div>

            {/* Preview Side */}
            <div 
              ref={previewContainerRef}
              onScroll={isHtmlEditor ? undefined : handlePreviewScroll}
              className={cn(
                "relative flex min-h-0 flex-col overflow-auto bg-muted/20",
                mode === "edit" && "hidden",
                mode === "preview" && "lg:col-span-2"
              )}
            >
            {isHtmlEditor ? (
              <HtmlPreview
                html={markdown || "<p class=\"text-zinc-400\">Nothing to preview yet.</p>"}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="flex-1 p-6 lg:p-10">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-10 border-b border-border/60 pb-6">
                    <h1 className="mb-3 text-[30px] font-semibold leading-tight tracking-[-0.02em]">{title || t.common.title}</h1>
                    {description && (
                      <p className="text-[15px] leading-6 text-muted-foreground">{description}</p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-6">
                        {tags.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => (
                          <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <MarkdownRenderer
                    linkToSectionLabel={t.common.linkToSection}
                    markdown={markdown || t.admin.articleEditor.previewFallback}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <PathPicker
        open={isPathPickerOpen}
        onOpenChange={setIsPathPickerOpen}
        onSelect={handlePathSelect}
        currentPath={path.split("/").slice(0, -1).join("/")}
      />
    </form>
  );
}
