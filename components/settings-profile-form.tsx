"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { SettingsActionState } from "@/app/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";

type SettingsProfileFormProps = {
  action: (
    state: SettingsActionState,
    formData: FormData,
  ) => Promise<SettingsActionState>;
  initialState: SettingsActionState;
  user: {
    name: string;
    email: string;
    image?: string | null;
    emailVerified: boolean;
  };
};

export function SettingsProfileForm({
  action,
  initialState,
  user,
}: SettingsProfileFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const t = useT();

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-name">{t.settings.profile.name}</Label>
          <Input
            id="settings-name"
            name="name"
            defaultValue={user.name}
            required
            className="rounded-xl"
          />
          {state.fieldErrors?.name?.length ? (
            <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-image">{t.settings.profile.image}</Label>
          <Input
            id="settings-image"
            name="image"
            defaultValue={user.image ?? ""}
            placeholder="https://example.com/avatar.png"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            {t.settings.profile.imageHint}
          </p>
          {state.fieldErrors?.image?.length ? (
            <p className="text-sm text-destructive">{state.fieldErrors.image[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-email">{t.settings.profile.email}</Label>
          <Input
            id="settings-email"
            value={user.email}
            disabled
            readOnly
            className="rounded-xl opacity-100"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-email-status">{t.settings.profile.emailStatus}</Label>
          <Input
            id="settings-email-status"
            value={
              user.emailVerified
                ? t.settings.profile.emailVerified
                : t.settings.profile.emailUnverified
            }
            disabled
            readOnly
            className="rounded-xl opacity-100"
          />
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
