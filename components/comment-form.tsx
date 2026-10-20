"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { CommentActionState } from "@/app/actions/comments";
import { useT } from "@/lib/i18n/provider";

type CommentFormProps = {
  action: (
    state: CommentActionState,
    formData: FormData,
  ) => Promise<CommentActionState>;
  initialState: CommentActionState;
};

export function CommentForm({ action, initialState }: CommentFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, initialState);
  const t = useT();

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-4" ref={formRef}>
      <label className="flex flex-col gap-2 text-[13px] font-medium text-foreground">
        <span>{t.wiki.leaveComment}</span>
        <textarea
          className="min-h-32 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          name="body"
          placeholder={t.wiki.commentPlaceholder}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{t.wiki.submitForReview}</SubmitButton>
        {state.error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-700 dark:text-emerald-400">
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
