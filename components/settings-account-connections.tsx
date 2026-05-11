"use client";

import type { ComponentProps } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Shield } from "lucide-react";
import type { SettingsActionState } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { localizeHref } from "@/lib/i18n/config";
import { oidcProviderId } from "@/lib/auth/provider-config";

type ProviderKey = "github" | "oidc";

type AccountConnection = {
  provider: ProviderKey;
  providerId: string;
  label: string;
  connected: boolean;
  accountId?: string;
};

type SettingsAccountConnectionsProps = {
  accounts: AccountConnection[];
  totalLinkedAccountCount: number;
  unlinkAction: (
    locale: Locale,
    providerId: string,
    accountId?: string,
  ) => Promise<SettingsActionState>;
  initialError?: string | null;
};

function GitHubIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.51v-1.82c-2.94.64-3.56-1.25-3.56-1.25-.48-1.22-1.17-1.54-1.17-1.54-.96-.66.07-.65.07-.65 1.06.08 1.62 1.09 1.62 1.09.95 1.62 2.48 1.15 3.08.88.1-.68.37-1.15.67-1.42-2.35-.27-4.82-1.17-4.82-5.22 0-1.15.41-2.09 1.08-2.83-.11-.26-.47-1.34.1-2.79 0 0 .88-.28 2.89 1.08A10.1 10.1 0 0 1 12 6.84c.9 0 1.8.12 2.64.35 2-1.36 2.88-1.08 2.88-1.08.57 1.45.21 2.53.1 2.79.68.74 1.08 1.68 1.08 2.83 0 4.06-2.47 4.95-4.83 5.21.38.33.72.99.72 2v2.97c0 .28.19.62.73.51A10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
  );
}

export function SettingsAccountConnections({
  accounts,
  totalLinkedAccountCount,
  unlinkAction,
  initialError,
}: SettingsAccountConnectionsProps) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [linkingProvider, setLinkingProvider] = useState<ProviderKey | null>(null);
  const [actionState, setActionState] = useState<SettingsActionState>(
    initialError ? { error: initialError } : {},
  );
  const [isPending, startTransition] = useTransition();

  async function handleLink(provider: ProviderKey) {
    setLinkingProvider(provider);
    setActionState({});

    const endpoint =
      provider === "github" ? "/api/auth/link-social" : "/api/auth/oauth2/link";
    const body =
      provider === "github"
        ? {
            provider: "github",
            callbackURL: localizeHref(locale, "/settings"),
            errorCallbackURL: `${localizeHref(locale, "/settings")}?error=link_failed`,
          }
        : {
            providerId: oidcProviderId,
            callbackURL: localizeHref(locale, "/settings"),
            errorCallbackURL: `${localizeHref(locale, "/settings")}?error=link_failed`,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; redirect?: boolean }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error("Failed to link provider");
      }

      window.location.assign(data.url);
    } catch {
      setActionState({ error: t.settings.accounts.linkError });
      setLinkingProvider(null);
    }
  }

  function handleUnlink(account: AccountConnection) {
    setActionState({});

    startTransition(async () => {
      const result = await unlinkAction(
        locale,
        account.providerId,
        account.accountId,
      );
      setActionState(result);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {accounts.map((account) => {
          const isLinking = linkingProvider === account.provider;
          const canUnlink = account.connected && totalLinkedAccountCount > 1;

          return (
            <div
              key={account.providerId}
              className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-muted p-2">
                  {account.provider === "github" ? (
                    <GitHubIcon className="size-5" />
                  ) : (
                    <Shield className="size-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="font-medium">{account.label}</div>
                  <p className="text-sm text-muted-foreground">
                    {account.connected
                      ? t.settings.accounts.connected
                      : t.settings.accounts.notConnected}
                  </p>
                  {account.connected && account.accountId ? (
                    <p className="text-xs text-muted-foreground">
                      {t.settings.accounts.accountIdentifier}: {account.accountId}
                    </p>
                  ) : null}
                </div>
              </div>

              {account.connected ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canUnlink || isPending}
                  onClick={() => handleUnlink(account)}
                  className="rounded-xl"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t.common.working}
                    </>
                  ) : (
                    t.settings.accounts.unlink
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isLinking}
                  onClick={() => handleLink(account.provider)}
                  className="rounded-xl"
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t.common.working}
                    </>
                  ) : (
                    t.settings.accounts.link
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {accounts.length > 0 && !accounts.some((account) => account.connected) ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {t.settings.accounts.noConnectedAccounts}
        </p>
      ) : null}
      {accounts.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {t.settings.accounts.noProvidersConfigured}
        </p>
      ) : null}

      {accounts.length > 0 && totalLinkedAccountCount <= 1 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {t.settings.accounts.unlinkLastAccountHint}
        </p>
      ) : null}

      {actionState.error ? (
        <p className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {actionState.error}
        </p>
      ) : null}
      {actionState.success ? (
        <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          {actionState.success}
        </p>
      ) : null}
    </div>
  );
}
