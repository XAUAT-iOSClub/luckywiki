"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Github, Loader2, Shield } from "lucide-react";
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
                    <Github className="size-5" />
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
