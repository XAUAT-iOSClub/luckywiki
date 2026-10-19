"use client";

import type { ComponentProps } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import type { FormActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type RestoreRevisionFormProps = {
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  revisionId: string;
  label: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
};

export function RestoreRevisionForm({
  action,
  revisionId,
  label,
  className,
  variant = "outline",
  size = "sm",
}: RestoreRevisionFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (state.success?.startsWith("/")) {
      router.push(state.success);
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form
      action={formAction}
      className={cn("flex flex-col items-start gap-1", className)}
      onSubmit={(event) => {
        if (!window.confirm(t.admin.revisionHistory.restoreConfirm)) {
          event.preventDefault();
        }
      }}
    >
      <input name="revisionId" type="hidden" value={revisionId} />
      <Button
        disabled={isPending}
        size={size}
        type="submit"
        variant={variant}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RotateCcw className="size-3.5" />
        )}
        {label}
      </Button>
      {state.error ? (
        <p className="max-w-56 text-[11px] leading-4 text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
