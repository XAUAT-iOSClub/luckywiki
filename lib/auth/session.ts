import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { localizeHref } from "@/lib/i18n/config";
import { auth } from "@/lib/auth";
import {
  canAccessAdminShell,
  canComment,
  canManageUsers,
} from "@/lib/auth/permissions";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireAuthorSession(locale: Locale) {
  const session = await getCurrentSession();

  if (!session) {
    redirect(
      `${localizeHref(locale, "/auth/sign-in")}?next=${encodeURIComponent(localizeHref(locale, "/admin"))}`,
    );
  }

  if (!canAccessAdminShell(session.user)) {
    redirect(localizeHref(locale, "/wiki"));
  }

  return session;
}

export async function requireRootSession(
  locale: Locale,
  unauthorizedRedirectPath = localizeHref(locale, "/wiki"),
) {
  const session = await getCurrentSession();

  if (!session) {
    redirect(
      `${localizeHref(locale, "/auth/sign-in")}?next=${encodeURIComponent(localizeHref(locale, "/admin"))}`,
    );
  }

  if (!canManageUsers(session.user)) {
    redirect(unauthorizedRedirectPath);
  }

  return session;
}

export async function requireVerifiedSession(locale: Locale, nextPath: string) {
  const session = await getCurrentSession();

  if (!session) {
    redirect(
      `${localizeHref(locale, "/auth/sign-in")}?next=${encodeURIComponent(nextPath)}`,
    );
  }

  if (!canComment(session.user)) {
    redirect(`${localizeHref(locale, "/auth/verify-email")}?status=required`);
  }

  return session;
}
