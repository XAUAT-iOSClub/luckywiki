import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export function generateMetadata(): Metadata {
  return {
    title: "Verify Email",
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailPage({
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

  const [session, dictionary] = await Promise.all([
    getCurrentSession(),
    getDictionary(lang),
  ]);
  const status = getSingleSearchParam(await searchParams, "status");
  const isVerified = session?.user.emailVerified;

  return (
    <div className="w-full space-y-4 rounded-xl border border-border/70 bg-card p-6 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{dictionary.auth.verifyEmail}</p>
      <h1 className="text-[24px] font-semibold tracking-[-0.015em] text-balance">
        {isVerified ? dictionary.auth.emailVerified : dictionary.auth.checkInbox}
      </h1>
      <p className="text-[13px] leading-6 text-muted-foreground">
        {status === "required"
          ? dictionary.auth.verifyRequired
          : dictionary.auth.verifySent}
      </p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Link
          className="button-primary"
          href={isVerified ? localizeHref(lang, "/wiki") : localizeHref(lang, "/auth/sign-in")}
        >
          {isVerified ? dictionary.auth.goToWiki : dictionary.auth.backToSignIn}
        </Link>
        <Link className="button-secondary" href={localizeHref(lang, "/auth/sign-up")}>
          {dictionary.auth.registerAnother}
        </Link>
      </div>
    </div>
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}
