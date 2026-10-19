"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  const { pending } = useFormStatus();
  const t = useT();

  return (
    <Button
      className={className ?? "h-8 px-4 text-[13px] font-medium"}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          {t.common.working}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
