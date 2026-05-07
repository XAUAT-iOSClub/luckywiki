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
      <label className="field-block">
        <span>{t.wiki.leaveComment}</span>
        <textarea
          className="field-textarea min-h-36"
          name="body"
          placeholder={t.wiki.commentPlaceholder}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{t.wiki.submitForReview}</SubmitButton>
        {state.error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
