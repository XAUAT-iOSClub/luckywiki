"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { localizeHref, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { requireSession } from "@/lib/auth/session";

export type SettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: {
    name?: string[];
    image?: string[];
  };
};

function revalidateUserFacingPaths() {
  for (const locale of locales) {
    revalidatePath(localizeHref(locale, "/settings"));
    revalidatePath(localizeHref(locale, "/wiki"));
    revalidatePath(localizeHref(locale, "/agent"));
  }
}

export async function updateProfileAction(
  locale: Locale,
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const [, dictionary, requestHeaders] = await Promise.all([
    requireSession(locale, localizeHref(locale, "/settings")),
    getDictionary(locale),
    headers(),
  ]);

  const profileSchema = z.object({
    name: z.string().trim().min(1, dictionary.settings.validation.nameRequired),
    image: z.union([
      z.literal(""),
      z.url({
        protocol: /^https?$/,
        error: dictionary.settings.validation.imageInvalid,
      }),
    ]),
  });

  const parsed = profileSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    image: String(formData.get("image") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: dictionary.settings.profile.saveError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await auth.api.updateUser({
      headers: requestHeaders,
      body: {
        name: parsed.data.name,
        image: parsed.data.image || null,
      },
    });

    revalidateUserFacingPaths();

    return {
      success: dictionary.settings.profile.saveSuccess,
    };
  } catch {
    return {
      error: dictionary.settings.profile.saveError,
    };
  }
}

export async function unlinkAccountAction(
  locale: Locale,
  providerId: string,
  accountId?: string,
): Promise<SettingsActionState> {
  const [dictionary, requestHeaders] = await Promise.all([
    getDictionary(locale),
    headers(),
  ]);

  await requireSession(locale, localizeHref(locale, "/settings"));

  try {
    await auth.api.unlinkAccount({
      headers: requestHeaders,
      body: {
        providerId,
        ...(accountId ? { accountId } : {}),
      },
    });

    revalidateUserFacingPaths();

    return {
      success: dictionary.settings.accounts.unlinkSuccess,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("last account")
        ? dictionary.settings.accounts.unlinkLastAccountError
        : dictionary.settings.accounts.unlinkError;

    return { error: message };
  }
}
