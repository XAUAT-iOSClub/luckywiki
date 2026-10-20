"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Loader2, AlertCircle, CheckCircle2, GitGraph, Shield } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { localizeHref } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { AuthProviderFlags } from "@/lib/auth/provider-config";
import { oidcProviderId } from "@/lib/auth/provider-config";
import { getAuthErrorMessage } from "@/lib/auth/client-errors";

type AuthFormProps = {
  locale: Locale;
  mode: "sign-in" | "sign-up";
  nextPath: string;
  providers: AuthProviderFlags;
  initialErrorCode?: string;
};

export function AuthForm({
  locale,
  mode,
  nextPath,
  providers,
  initialErrorCode,
}: AuthFormProps) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<"github" | "oidc" | null>(null);
  const [error, setError] = useState<string | null>(
    getAuthErrorMessage(t, initialErrorCode),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const isSignUp = mode === "sign-up";
  const hasSocialProviders = providers.githubEnabled || providers.oidcEnabled;
  const oidcProviderLabel = t.auth.continueWithProvider.replace(
    "{provider}",
    providers.oidcProviderName,
  );
  const errorCallbackURL = `${
    isSignUp ? localizeHref(locale, "/auth/sign-up") : localizeHref(locale, "/auth/sign-in")
  }?next=${encodeURIComponent(nextPath)}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: localizeHref(locale, "/auth/verify-email"),
        });

        if (result.error) {
          setError(result.error.message ?? t.auth.createAccountError);
          return;
        }

        setNotice(t.auth.accountCreated);
        setPassword("");
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? t.auth.signInError);
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSocialSignIn(provider: "github" | "oidc") {
    setOauthPending(provider);
    setError(null);
    setNotice(null);

    try {
      if (provider === "github") {
        await authClient.signIn.social({
          provider: "github",
          callbackURL: nextPath,
          errorCallbackURL,
        });
        return;
      }

      await authClient.signIn.oauth2({
        providerId: oidcProviderId,
        callbackURL: nextPath,
        errorCallbackURL,
      });
    } catch {
      setError(t.auth.socialSignInError);
      setOauthPending(null);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full justify-end">
        <Suspense fallback={null}>
          <LocaleSwitcher />
        </Suspense>
      </div>
      <Link href={localizeHref(locale, "/wiki")} className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="size-4 text-primary-foreground" />
        </div>
        <span className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">LuckyWiki</span>
      </Link>

      <Card className="w-full max-w-[400px] border-border/70 bg-card shadow-none">
        <CardHeader className="gap-1 pb-4 text-center">
          <CardTitle className="text-[22px] font-semibold tracking-[-0.015em]">
            {isSignUp ? t.auth.createAccount : t.auth.welcomeBack}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {isSignUp 
              ? t.auth.signUpDescription 
              : t.auth.signInDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasSocialProviders && (
            <div className="mb-6 space-y-4">
              <div className="grid gap-3">
                {providers.githubEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-9 w-full"
                    disabled={pending || oauthPending !== null}
                    onClick={() => handleSocialSignIn("github")}
                  >
                    {oauthPending === "github" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.working}
                      </>
                    ) : (
                      <>
                        <GitGraph className="mr-2 h-4 w-4" />
                        {t.auth.continueWithGitHub}
                      </>
                    )}
                  </Button>
                )}
                {providers.oidcEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-9 w-full"
                    disabled={pending || oauthPending !== null}
                    onClick={() => handleSocialSignIn("oidc")}
                  >
                    {oauthPending === "oidc" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.working}
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        {oidcProviderLabel}
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t.auth.orContinueWith}
                </span>
                <Separator className="flex-1" />
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-[12px] font-medium">{t.auth.name}</Label>
                <Input
                  id="name"
                  placeholder="Steve Jobs"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[12px] font-medium">{t.auth.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[12px] font-medium">{t.auth.password}</Label>
                {!isSignUp && (
                  <Link 
                    href={localizeHref(locale, "/auth/forgot-password")} 
                    className="text-xs text-primary hover:underline underline-offset-4"
                  >
                    {t.auth.forgotPassword}
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-[12px] text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {notice && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2.5 text-[12px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>{notice}</p>
              </div>
            )}

            <Button
              type="submit"
              className="h-9 w-full text-[13px] font-medium"
              disabled={pending || oauthPending !== null}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.common.working}
                </>
              ) : (
                isSignUp ? t.common.signUp : t.common.signIn
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col border-t border-border/60 bg-muted/30 py-3 text-center">
          <p className="text-[11.5px] text-muted-foreground">
            {isSignUp ? t.auth.hasAccount : t.auth.noAccount}{" "}
            <Link 
              href={isSignUp 
                ? `${localizeHref(locale, "/auth/sign-in")}?next=${encodeURIComponent(nextPath)}` 
                : `${localizeHref(locale, "/auth/sign-up")}?next=${encodeURIComponent(nextPath)}`
              }
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              {isSignUp ? t.common.signIn : t.auth.createOne}
            </Link>
          </p>
        </CardFooter>
      </Card>
      
      <p className="px-6 text-center text-[11.5px] leading-5 text-muted-foreground">
        {t.auth.byContinuing}{" "}
        <Link href={localizeHref(locale, "/terms")} className="underline underline-offset-4 hover:text-primary">
          {t.auth.terms}
        </Link>{" "}
        {locale === "zh" ? "和" : "and"}{" "}
        <Link href={localizeHref(locale, "/privacy")} className="underline underline-offset-4 hover:text-primary">
          {t.auth.privacy}
        </Link>
        .
      </p>
    </div>
  );
}
