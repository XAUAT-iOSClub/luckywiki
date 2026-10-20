import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Page, PageHeader, Panel, PanelBody } from "@/components/ui/page-ui";
import { SettingsAccountConnections } from "@/components/settings-account-connections";
import { SettingsProfileForm } from "@/components/settings-profile-form";
import { updateProfileAction, unlinkAccountAction } from "@/app/actions/settings";
import { getCurrentSession } from "@/lib/auth/session";
import { auth } from "@/lib/auth";
import { getAuthProviderFlags, oidcProviderId } from "@/lib/auth/provider-config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;
type ConfiguredAccount = {
  provider: "github" | "oidc";
  providerId: string;
  label: string;
  connected: boolean;
  accountId?: string;
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return buildPageMetadata(
    {
      title: dictionary.settings.title,
      description: dictionary.settings.description,
      path: localizeHref(lang, "/settings"),
    },
    lang,
  );
}

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
    <Page className="max-w-4xl">
      <PageHeader
        description={dictionary.settings.description}
        descriptionClassName="text-[13.5px] leading-6"
        title={dictionary.settings.title}
        titleClassName="text-[28px] sm:text-[30px]"
      />

      <Panel
        description={dictionary.settings.profile.description}
        title={dictionary.settings.profile.title}
      >
        <PanelBody>
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
        </PanelBody>
      </Panel>

      <Panel
        description={dictionary.settings.accounts.description}
        title={dictionary.settings.accounts.title}
      >
        <PanelBody>
          <SettingsAccountConnections
            accounts={configuredAccounts}
            totalLinkedAccountCount={linkedAccounts.length}
            unlinkAction={unlinkAccountAction}
            initialError={initialConnectionError}
          />
        </PanelBody>
      </Panel>
    </Page>
  );
}

function getSingleSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}
