"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export function SignOutButton() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();

  async function handleSignOut() {
    await authClient.signOut();
    router.push(localizeHref(locale, "/wiki"));
    router.refresh();
  }

  return (
    <button className="button-secondary" onClick={handleSignOut} type="button">
      {t.common.signOut}
    </button>
  );
}
