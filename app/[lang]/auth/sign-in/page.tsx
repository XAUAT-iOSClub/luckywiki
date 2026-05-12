import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuthProviderFlags } from "@/lib/auth/provider-config";
import { getCurrentSession } from "@/lib/auth/session";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export function generateMetadata(): Metadata {
  return {
    title: "Sign In",
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang } = await params;
  const resolvedSearchParams = await searchParams;

  if (!hasLocale(lang)) {
    notFound();
  }

  const session = await getCurrentSession();
  const providers = getAuthProviderFlags();
  const nextPath = resolveNextPath(
    getSingleSearchParam(resolvedSearchParams, "next"),
    lang,
  );
  const errorCode = getSingleSearchParam(resolvedSearchParams, "error");

  if (session) {
    redirect(nextPath);
  }

  return (
    <AuthForm
      locale={lang}
      mode="sign-in"
      nextPath={nextPath}
      providers={providers}
      initialErrorCode={errorCode}
    />
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function resolveNextPath(value: string | undefined, locale: "zh" | "en") {
  if (value?.startsWith("/")) {
    return value;
  }

  return localizeHref(locale, "/wiki");
}
