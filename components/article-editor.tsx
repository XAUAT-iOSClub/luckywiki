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
  Type,
  User,
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
  FolderOpen,
} from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PathPicker } from "@/components/path-picker";
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
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
  const [isPathPickerOpen, setIsPathPickerOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownRef = useRef<HTMLTextAreaElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);

  // Sync scroll between editor and preview
  const handleScroll = (source: "editor" | "preview") => {
    if (mode !== "split" || isSyncingRef.current) {
      return;
    }

    const editor = editorContainerRef.current;
    const preview = previewContainerRef.current;
    const textarea = markdownRef.current;

    if (!editor || !preview || !textarea) {
      return;
    }

    isSyncingRef.current = true;

    if (source === "editor") {
      const lines = markdown.split("\n");
      const totalLines = lines.length || 1;
      const editorScrollTop = editor.scrollTop;
      const editorScrollHeight = editor.scrollHeight;
      const editorClientHeight = editor.clientHeight;

      if (editorScrollTop <= 5) {
        preview.scrollTo({ top: 0, behavior: "auto" });
      } else if (editorScrollTop + editorClientHeight >= editorScrollHeight - 5) {
        preview.scrollTo({ top: preview.scrollHeight - preview.clientHeight, behavior: "auto" });
      } else {
        const lineHeight = editorScrollHeight / totalLines;
        const currentLine = Math.floor(editorScrollTop / lineHeight) + 1;

        const previewElements = preview.querySelectorAll("[data-line]");
        let targetElement: HTMLElement | null = null;
        let prevElement: HTMLElement | null = null;

        for (let i = 0; i < previewElements.length; i++) {
          const el = previewElements[i] as HTMLElement;
          const line = parseInt(el.getAttribute("data-line") || "0", 10);
          if (line >= currentLine) {
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
            const ratio = (currentLine - prevLine) / (targetLine - prevLine);
            offset = prevTop + ratio * (targetTop - prevTop);
          } else {
            offset = targetTop;
          }
          
          preview.scrollTop = offset - 40;
        }
      }
    } else {
      const previewScrollTop = preview.scrollTop;
      const previewScrollHeight = preview.scrollHeight;
      const previewClientHeight = preview.clientHeight;

      if (previewScrollTop <= 5) {
        editor.scrollTop = 0;
      } else if (previewScrollTop + previewClientHeight >= previewScrollHeight - 5) {
        editor.scrollTop = editor.scrollHeight - editor.clientHeight;
      } else {
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

        const editorScrollHeight = editor.scrollHeight;
        const totalLines = markdown.split("\n").length || 1;
        const lineHeight = editorScrollHeight / totalLines;

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
          editor.scrollTop = (targetLine - 1) * lineHeight;
        }
      }
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    });
  };

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
    <form action={formAction} className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] relative overflow-hidden">
      {/* Hidden inputs for metadata to be included in form submission */}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="tags" value={tags} />
      <input type="hidden" name="editor" value={editor} />
      <input type="hidden" name="description" value={description} />

      {/* Main Working Area: Editor & Preview */}
      <section className="flex-1 flex flex-col min-h-0 rounded-t-[2.5rem] lg:rounded-[2.5rem] border border-border/40 bg-white/60 dark:bg-zinc-900/60 shadow-2xl overflow-hidden backdrop-blur-2xl">
        {/* Unified Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-3 border-b border-border/20 bg-white/60 dark:bg-black/60 backdrop-blur-xl shrink-0 sticky top-0 z-40">
          {/* Left: Tools */}
          <div className="flex items-center gap-2">
            <Menubar className="h-9 rounded-full px-2 border-border/50 bg-background/50 backdrop-blur-sm">
              <MenubarMenu>
                <MenubarTrigger className="h-7 px-3 text-[10px] font-bold uppercase tracking-tight rounded-full">
                  <Heading1 className="size-3.5 mr-1.5" /> {t.admin.articleEditor.menubar.headings}
                </MenubarTrigger>
                <MenubarContent className="rounded-xl">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("# ")} className="text-xs">
                    <Heading1 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading1}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("## ")} className="text-xs">
                    <Heading2 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading2}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("### ")} className="text-xs">
                    <Heading3 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.heading3}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 px-3 text-[10px] font-bold uppercase tracking-tight rounded-full">
                  {t.admin.articleEditor.menubar.format}
                </MenubarTrigger>
                <MenubarContent className="rounded-xl">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("**Bold Text**")} className="text-xs">
                    <Bold className="size-4 mr-2" /> {t.admin.articleEditor.menubar.bold}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("*Italic Text*")} className="text-xs">
                    <Italic className="size-4 mr-2" /> {t.admin.articleEditor.menubar.italic}
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem onClick={() => insertMarkdownAtCursor("> Quote")} className="text-xs">
                    <Quote className="size-4 mr-2" /> {t.admin.articleEditor.menubar.blockquote}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("---")} className="text-xs">
                    <Minus className="size-4 mr-2" /> {t.admin.articleEditor.menubar.separator}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 px-3 text-[10px] font-bold uppercase tracking-tight rounded-full">
                  {t.admin.articleEditor.menubar.list}
                </MenubarTrigger>
                <MenubarContent className="rounded-xl">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("- Item")} className="text-xs">
                    <List className="size-4 mr-2" /> {t.admin.articleEditor.menubar.bulletList}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("1. Item")} className="text-xs">
                    <ListOrdered className="size-4 mr-2" /> {t.admin.articleEditor.menubar.numberedList}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="h-7 px-3 text-[10px] font-bold uppercase tracking-tight rounded-full">
                  {t.admin.articleEditor.menubar.insert}
                </MenubarTrigger>
                <MenubarContent className="rounded-xl">
                  <MenubarItem onClick={() => insertMarkdownAtCursor("```\nCode Block\n```")} className="text-xs">
                    <Code className="size-4 mr-2" /> {t.admin.articleEditor.menubar.codeBlock}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("| Header | Header |\n| --- | --- |\n| Cell | Cell |")} className="text-xs">
                    <TableIcon className="size-4 mr-2" /> {t.admin.articleEditor.menubar.table}
                  </MenubarItem>
                  <MenubarItem onClick={() => insertMarkdownAtCursor("[Link Text](url)")} className="text-xs">
                    <Link2 className="size-4 mr-2" /> {t.admin.articleEditor.menubar.link}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>

            <div className="h-6 w-px bg-border/20 mx-1 hidden sm:block" />

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
              className="h-9 px-4 rounded-full text-[10px] font-bold uppercase tracking-tight hover:bg-primary/5 hover:text-primary transition-all active:scale-95 hidden md:flex"
            >
              {isUploadingImage ? (
                <Loader2 className="size-3.5 animate-spin mr-2" />
              ) : (
                <ImageUp className="size-3.5 mr-2" />
              )}
              {isUploadingImage ? "..." : t.admin.articleEditor.insertImage}
            </Button>
          </div>

          {/* Center: Mode Switcher */}
          <div className="flex items-center gap-1 bg-background/50 p-1 rounded-full border border-border/50">
            <Button
              type="button"
              variant={mode === "edit" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("edit")}
              className="h-7 px-3 rounded-full text-[10px] font-bold uppercase transition-all active:scale-95"
            >
              <Edit3 className="size-3" />
            </Button>
            <Button
              type="button"
              variant={mode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("split")}
              className="hidden lg:flex h-7 px-3 rounded-full text-[10px] font-bold uppercase transition-all active:scale-95"
            >
              <Layout className="size-3" />
            </Button>
            <Button
              type="button"
              variant={mode === "preview" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("preview")}
              className="h-7 px-3 rounded-full text-[10px] font-bold uppercase transition-all active:scale-95"
            >
              <Eye className="size-3" />
            </Button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {(state.error || state.success) && (
              <div className={cn(
                "hidden lg:block px-4 py-1.5 rounded-full text-[10px] font-bold max-w-[150px] truncate shadow-sm",
                state.error ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              )}>
                {state.error || state.success}
              </div>
            )}

            <Drawer direction="right">
              <DrawerTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 px-4 rounded-full text-[10px] font-bold uppercase tracking-tight hover:bg-primary/5 hover:text-primary transition-all active:scale-95">
                  <Settings2 className="size-3.5 mr-2" />
                  <span className="hidden sm:inline">{t.admin.articleEditor.articleSettings}</span>
                </Button>
              </DrawerTrigger>
              <DrawerContent className="w-full sm:max-w-md border-l border-border/40 backdrop-blur-3xl bg-white/80 dark:bg-zinc-950/80 shadow-2xl">
                <DrawerHeader className="mb-8">
                  <DrawerTitle className="text-2xl font-bold tracking-tight">{t.admin.articleEditor.articleSettings}</DrawerTitle>
                  <DrawerDescription>{t.admin.articleEditor.articleSettingsDescription}</DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-col gap-8 pb-10 overflow-y-auto max-h-[calc(100vh-12rem)] px-6">
                  <div className="space-y-3">
                    <Label htmlFor="drawer-title" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.title}
                    </Label>
                    <div className="relative group">
                      <Type className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                      <Input
                        id="drawer-title"
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t.common.title}
                        value={title}
                        className="h-12 rounded-2xl border-border/40 bg-background/50 pl-11 shadow-sm focus-visible:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="drawer-status" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.status}
                    </Label>
                    <Select
                      onValueChange={(value) => setStatus(value as ArticleStatus)}
                      value={status}
                    >
                      <SelectTrigger id="drawer-status" className="h-12 rounded-2xl bg-background/50 border-border/40 shadow-sm focus:ring-primary/20 transition-all">
                        <SelectValue placeholder={t.common.status} />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-border/40 backdrop-blur-xl bg-background/90">
                        <SelectItem value={ArticleStatus.DRAFT} className="rounded-xl">{t.common.draft}</SelectItem>
                        <SelectItem value={ArticleStatus.PUBLISHED} className="rounded-xl">{t.common.published}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="drawer-path" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.path}
                    </Label>
                    <div className="relative group flex gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                        <Input
                          id="drawer-path"
                          onChange={(event) => setPath(event.target.value)}
                          placeholder={t.admin.articleEditor.pathPlaceholder}
                          value={path}
                          className="h-12 pl-11 rounded-2xl bg-background/50 border-border/40 shadow-sm focus-visible:ring-primary/20 transition-all"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsPathPickerOpen(true)}
                        className="h-12 w-12 rounded-2xl shrink-0 border-border/40 bg-background/50 hover:bg-muted transition-all"
                        title={t.admin.articleEditor.pathPicker.pickParent}
                      >
                        <FolderOpen className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="drawer-tags" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.tags}
                    </Label>
                    <div className="relative group">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                      <Input
                        id="drawer-tags"
                        onChange={(event) => setTags(event.target.value)}
                        placeholder={t.admin.articleEditor.tagsPlaceholder}
                        value={tags}
                        className="h-12 pl-11 rounded-2xl bg-background/50 border-border/40 shadow-sm focus-visible:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="drawer-editor" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.editor}
                    </Label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                      <Input
                        id="drawer-editor"
                        onChange={(event) => setEditor(event.target.value)}
                        placeholder={t.admin.articleEditor.editorPlaceholder}
                        value={editor}
                        className="h-12 pl-11 rounded-2xl bg-background/50 border-border/40 shadow-sm focus-visible:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="drawer-description" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 ml-1">
                      {t.common.description}
                    </Label>
                    <Textarea
                      id="drawer-description"
                      className="min-h-32 rounded-2xl bg-background/50 border-border/40 shadow-sm focus-visible:ring-primary/20 resize-none py-4 px-5 leading-relaxed transition-all"
                      maxLength={280}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t.admin.articleEditor.descriptionPlaceholder}
                      value={description}
                    />
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            <SubmitButton className="rounded-full h-9 px-6 shadow-lg shadow-primary/20 bg-primary hover:shadow-primary/30 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-tight">
              {submitLabel}
            </SubmitButton>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 lg:divide-x divide-border/20">
          {/* Markdown Editor Side */}
          <div className={cn(
            "flex flex-col min-h-0",
            mode === "preview" && "hidden",
            mode === "edit" && "lg:col-span-2"
          )}>
            <div className="flex-1 flex flex-col min-h-0">
                <div 
                  ref={editorContainerRef}
                  onScroll={() => handleScroll("editor")}
                  className="flex-1 overflow-auto"
                >
                  <Textarea
                    className="w-full h-auto min-h-full font-mono text-sm leading-relaxed border-none focus-visible:ring-0 bg-transparent resize-none p-6 lg:p-10 selection:bg-primary/20 overflow-hidden"
                    onPaste={handleMarkdownPaste}
                    name="markdown"
                    ref={markdownRef}
                    onChange={(event) => setMarkdown(event.target.value)}
                    placeholder={t.admin.articleEditor.markdownPlaceholder}
                    value={markdown}
                  />
                </div>
                <div className="px-6 py-3 border-t border-border/10 flex items-center justify-between shrink-0 bg-white/5 dark:bg-black/5">
                  <p className="text-[10px] text-muted-foreground/50 italic">
                    {t.admin.articleEditor.imageUploadHint}
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
                    {markdown.length} chars
                  </span>
                </div>
              </div>
            </div>

            {/* Preview Side */}
            <div 
              ref={previewContainerRef}
              onScroll={() => handleScroll("preview")}
              className={cn(
                "flex flex-col min-h-0 bg-slate-50/30 dark:bg-zinc-950/20 overflow-auto relative",
                mode === "edit" && "hidden",
                mode === "preview" && "lg:col-span-2"
              )}
            >
            <div className="flex-1 p-8 lg:p-16">
              <div className="max-w-3xl mx-auto">
                <div className="mb-12 border-b border-border/20 pb-8">
                  <h1 className="text-4xl font-bold tracking-tight mb-4">{title || t.common.title}</h1>
                  {description && (
                    <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-6">
                      {tags.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
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
          </div>
        </div>
      </section>

      <style jsx global>{`
        /* Attempt to make the layout more immersive by removing outer scroll and padding where possible */
        html, body {
          overflow: hidden !important;
          height: 100% !important;
        }

        .admin-layout-container {
          padding: 0 !important;
          gap: 0 !important;
          height: 100vh !important;
          overflow: hidden !important;
        }
        
        .admin-layout-content {
          max-width: none !important;
          height: 100% !important;
          padding: 1.5rem !important;
          overflow: hidden !important;
        }

        @media (min-width: 1024px) {
          .admin-layout-content {
            padding: 2rem !important;
          }
        }
        
        /* Ensure the main form takes full height */
        form {
          height: 100% !important;
        }
      `}</style>
      <PathPicker
        open={isPathPickerOpen}
        onOpenChange={setIsPathPickerOpen}
        onSelect={handlePathSelect}
        currentPath={path.split("/").slice(0, -1).join("/")}
      />
    </form>
  );
}
