"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { SiteSettingsActionState } from "@/app/actions/site-settings";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/provider";

type SiteSettingsFormProps = {
  action: (
    state: SiteSettingsActionState,
    formData: FormData,
  ) => Promise<SiteSettingsActionState>;
  initialState: SiteSettingsActionState;
  settings: {
    siteName: string;
    description: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
  };
};

export function SiteSettingsForm({
  action,
  initialState,
  settings,
}: SiteSettingsFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const t = useT();

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="site-settings-name">{t.siteSettings.siteName}</Label>
        <Input
          id="site-settings-name"
          name="siteName"
          defaultValue={settings.siteName}
          placeholder={t.siteSettings.siteNamePlaceholder}
          required
          className="rounded-xl"
        />
        {state.fieldErrors?.siteName?.length ? (
          <p className="text-sm text-destructive">{state.fieldErrors.siteName[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="site-settings-description">{t.siteSettings.siteDescription}</Label>
        <Textarea
          id="site-settings-description"
          name="description"
          defaultValue={settings.description ?? ""}
          placeholder={t.siteSettings.siteDescriptionPlaceholder}
          className="rounded-xl"
          rows={2}
        />
        {state.fieldErrors?.description?.length ? (
          <p className="text-sm text-destructive">{state.fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="site-settings-logo-url">{t.siteSettings.logoUrl}</Label>
          <Input
            id="site-settings-logo-url"
            name="logoUrl"
            defaultValue={settings.logoUrl ?? ""}
            placeholder={t.siteSettings.logoUrlPlaceholder}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            {t.siteSettings.logoUrlHint}
          </p>
          {state.fieldErrors?.logoUrl?.length ? (
            <p className="text-sm text-destructive">{state.fieldErrors.logoUrl[0]}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="site-settings-favicon-url">{t.siteSettings.faviconUrl}</Label>
          <Input
            id="site-settings-favicon-url"
            name="faviconUrl"
            defaultValue={settings.faviconUrl ?? ""}
            placeholder={t.siteSettings.faviconUrlPlaceholder}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            {t.siteSettings.faviconUrlHint}
          </p>
          {state.fieldErrors?.faviconUrl?.length ? (
            <p className="text-sm text-destructive">{state.fieldErrors.faviconUrl[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{t.common.saveChanges}</SubmitButton>
        {state.error ? (
          <p className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
