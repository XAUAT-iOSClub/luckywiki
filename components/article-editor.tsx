"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArticleStatus } from "@/generated/prisma/enums";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SubmitButton } from "@/components/submit-button";
import type { FormActionState } from "@/app/actions/admin";

type ArticleEditorProps = {
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  initialState: FormActionState;
  initialValues?: {
    title: string;
    path: string;
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
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [path, setPath] = useState(initialValues?.path ?? "");
  const [markdown, setMarkdown] = useState(initialValues?.markdown ?? "");
  const [status, setStatus] = useState<ArticleStatus>(
    initialValues?.status ?? ArticleStatus.DRAFT,
  );

  useEffect(() => {
    if (state.success?.startsWith("/")) {
      router.push(state.success);
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="field-block">
          <span>Title</span>
          <input
            required
            className="field-input"
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="How to structure your knowledge base"
            value={title}
          />
        </label>
        <label className="field-block">
          <span>Status</span>
          <select
            className="field-input"
            name="status"
            onChange={(event) => setStatus(event.target.value as ArticleStatus)}
            value={status}
          >
            <option value={ArticleStatus.DRAFT}>Draft</option>
            <option value={ArticleStatus.PUBLISHED}>Published</option>
          </select>
        </label>
      </div>

      <label className="field-block">
        <span>Path</span>
        <input
          required
          className="field-input"
          name="path"
          onChange={(event) => setPath(event.target.value)}
          placeholder="指南/next-16/入门"
          value={path}
        />
      </label>

      <div className="grid gap-6 xl:grid-cols-2">
        <label className="field-block">
          <span>Markdown</span>
          <textarea
            className="field-textarea min-h-[480px]"
            name="markdown"
            onChange={(event) => setMarkdown(event.target.value)}
            placeholder="# Start writing..."
            value={markdown}
          />
        </label>
        <div className="field-block">
          <span>Preview</span>
          <div className="rounded-3xl border border-border/70 bg-white/80 p-5">
            <MarkdownRenderer markdown={markdown || "_Nothing to preview yet._"} />
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
