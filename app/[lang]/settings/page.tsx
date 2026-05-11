import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsAccountConnections } from "@/components/settings-account-connections";
import { SettingsProfileForm } from "@/components/settings-profile-form";
import { updateProfileAction, unlinkAccountAction } from "@/app/actions/settings";
import { getCurrentSession } from "@/lib/auth/session";
import { auth } from "@/lib/auth";
import { getAuthProviderFlags, oidcProviderId } from "@/lib/auth/provider-config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;
type ConfiguredAccount = {
  provider: "github" | "oidc";
  providerId: string;
  label: string;
  connected: boolean;
  accountId?: string;
};

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ lang }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  if (!hasLocale(lang)) {
    notFound();
  }

  const locale = lang;
  const [session, dictionary, requestHeaders] = await Promise.all([
    getCurrentSession(),
    getDictionary(locale),
    headers(),
  ]);

  if (!session) {
    redirect(
      `${localizeHref(locale, "/auth/sign-in")}?next=${encodeURIComponent(localizeHref(locale, "/settings"))}`,
    );
  }

  const providerFlags = getAuthProviderFlags();
  const linkedAccounts = await auth.api.listUserAccounts({
    headers: requestHeaders,
  });

  const configuredAccounts: ConfiguredAccount[] = [];

  if (providerFlags.githubEnabled) {
    configuredAccounts.push({
      provider: "github",
      providerId: "github",
      label: "GitHub",
      connected: linkedAccounts.some((account) => account.providerId === "github"),
      accountId: linkedAccounts.find((account) => account.providerId === "github")?.accountId,
    });
  }

  if (providerFlags.oidcEnabled) {
    configuredAccounts.push({
      provider: "oidc",
      providerId: oidcProviderId,
      label: providerFlags.oidcProviderName,
      connected: linkedAccounts.some((account) => account.providerId === oidcProviderId),
      accountId: linkedAccounts.find((account) => account.providerId === oidcProviderId)?.accountId,
    });
  }

  const errorCode = getSingleSearchParam(resolvedSearchParams, "error");
  const initialConnectionError =
    errorCode ? dictionary.settings.accounts.linkError : null;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary/70">
          {dictionary.common.settings}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {dictionary.settings.title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {dictionary.settings.description}
        </p>
      </div>

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>{dictionary.settings.profile.title}</CardTitle>
          <CardDescription>{dictionary.settings.profile.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsProfileForm
            action={updateProfileAction.bind(null, locale)}
            initialState={{}}
            user={{
              name: session.user.name,
              email: session.user.email,
              image: session.user.image,
              emailVerified: session.user.emailVerified,
            }}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>{dictionary.settings.accounts.title}</CardTitle>
          <CardDescription>{dictionary.settings.accounts.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsAccountConnections
            accounts={configuredAccounts}
            totalLinkedAccountCount={linkedAccounts.length}
            unlinkAction={unlinkAccountAction}
            initialError={initialConnectionError}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}
