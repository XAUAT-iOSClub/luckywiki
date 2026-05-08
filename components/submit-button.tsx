"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { pending } = useFormStatus();
  const t = useT();

  return (
    <Button 
      className="rounded-2xl h-11 px-8 font-semibold shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] active:translate-y-[0px]" 
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
