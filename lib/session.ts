import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canComment, isRootUser } from "@/lib/permissions";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireRootSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/auth/sign-in?next=/admin");
  }

  if (!isRootUser(session.user)) {
    redirect("/wiki");
  }

  return session;
}

export async function requireVerifiedSession(nextPath: string) {
  const session = await getCurrentSession();

  if (!session) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  if (!canComment(session.user)) {
    redirect("/auth/verify-email?status=required");
  }

  return session;
}
