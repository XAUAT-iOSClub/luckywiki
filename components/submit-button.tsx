"use client";

import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/provider";

export function SubmitButton({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { pending } = useFormStatus();
  const t = useT();

  return (
    <button className="button-primary" disabled={pending} type="submit">
      {pending ? t.common.working : children}
    </button>
  );
}
