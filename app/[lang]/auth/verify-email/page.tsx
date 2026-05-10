import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

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
    <div className="surface-panel max-w-xl space-y-5">
      <p className="eyebrow">{dictionary.auth.verifyEmail}</p>
      <h1 className="text-3xl font-semibold text-balance">
        {isVerified ? dictionary.auth.emailVerified : dictionary.auth.checkInbox}
      </h1>
      <p className="text-sm leading-7 text-muted-foreground">
        {status === "required"
          ? dictionary.auth.verifyRequired
          : dictionary.auth.verifySent}
      </p>
      <div className="flex flex-wrap gap-3">
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
