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
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[12px] font-medium" htmlFor="settings-name">{t.settings.profile.name}</Label>
          <Input
            id="settings-name"
            name="name"
            defaultValue={user.name}
            required
          />
          {state.fieldErrors?.name?.length ? (
            <p className="text-[11.5px] text-destructive">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[12px] font-medium" htmlFor="settings-image">{t.settings.profile.image}</Label>
          <Input
            id="settings-image"
            name="image"
            defaultValue={user.image ?? ""}
            placeholder="https://example.com/avatar.png"
          />
          <p className="text-[11.5px] leading-4 text-muted-foreground">
            {t.settings.profile.imageHint}
          </p>
          {state.fieldErrors?.image?.length ? (
            <p className="text-[11.5px] text-destructive">{state.fieldErrors.image[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[12px] font-medium" htmlFor="settings-email">{t.settings.profile.email}</Label>
          <Input
            id="settings-email"
            value={user.email}
            disabled
            readOnly
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[12px] font-medium" htmlFor="settings-email-status">{t.settings.profile.emailStatus}</Label>
          <Input
            id="settings-email-status"
            value={
              user.emailVerified
                ? t.settings.profile.emailVerified
                : t.settings.profile.emailUnverified
            }
            disabled
            readOnly
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{t.common.saveChanges}</SubmitButton>
        {state.error ? (
          <p className="inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
