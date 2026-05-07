import Link from "next/link";
import { getCurrentSession } from "@/lib/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  const status = getSingleSearchParam(await searchParams, "status");
  const isVerified = session?.user.emailVerified;

  return (
    <div className="surface-panel max-w-xl space-y-5">
      <p className="eyebrow">Verify Email</p>
      <h1 className="text-3xl font-semibold text-balance">
        {isVerified ? "Your email is verified." : "Check your inbox."}
      </h1>
      <p className="text-sm leading-7 text-muted-foreground">
        {status === "required"
          ? "You need to verify your email before posting comments."
          : "We sent a verification link to your email address. In local development, the link is printed in the server logs."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className="button-primary" href={isVerified ? "/wiki" : "/auth/sign-in"}>
          {isVerified ? "Go to wiki" : "Back to sign in"}
        </Link>
        <Link className="button-secondary" href="/auth/sign-up">
          Register another account
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
