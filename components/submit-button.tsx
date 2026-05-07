"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary" disabled={pending} type="submit">
      {pending ? "Working..." : children}
    </button>
  );
}
