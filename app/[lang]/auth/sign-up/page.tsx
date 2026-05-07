import { notFound, redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentSession } from "@/lib/session";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const session = await getCurrentSession();
  const nextPath = resolveNextPath(
    getSingleSearchParam(await searchParams, "next"),
    lang,
  );

  if (session) {
    redirect(nextPath);
  }

  return <AuthForm locale={lang} mode="sign-up" nextPath={nextPath} />;
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
