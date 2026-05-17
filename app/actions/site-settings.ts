"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/lib/i18n/config";
import { locales, localizeHref } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { prisma } from "@/lib/prisma";
import { requireRootSession } from "@/lib/auth/session";

export type SiteSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: {
    siteName?: string[];
    description?: string[];
    logoUrl?: string[];
    faviconUrl?: string[];
  };
};

function revalidateAll() {
  for (const locale of locales) {
    revalidatePath(localizeHref(locale, "/"));
    revalidatePath(localizeHref(locale, "/wiki/home"));
    revalidatePath(localizeHref(locale, "/agent"));
    revalidatePath(localizeHref(locale, "/admin"));
    revalidatePath(localizeHref(locale, "/admin/settings"));
  }
}

export async function updateSiteSettingsAction(
  locale: Locale,
  _previousState: SiteSettingsActionState,
  formData: FormData,
): Promise<SiteSettingsActionState> {
  const [session, dictionary] = await Promise.all([
    requireRootSession(locale),
    getDictionary(locale),
  ]);

  const schema = z.object({
    siteName: z
      .string()
      .trim()
      .min(1, dictionary.siteSettings.validation.siteNameRequired),
    description: z
      .string()
      .trim()
      .max(280, dictionary.siteSettings.validation.descriptionTooLong)
      .optional()
      .or(z.literal("")),
    logoUrl: z
      .union([
        z.literal(""),
        z.string().url({ message: dictionary.siteSettings.validation.logoUrlInvalid }),
      ])
      .optional(),
    faviconUrl: z
      .union([
        z.literal(""),
        z.string().url({ message: dictionary.siteSettings.validation.faviconUrlInvalid }),
      ])
      .optional(),
  });

  const parsed = schema.safeParse({
    siteName: String(formData.get("siteName") ?? ""),
    description: String(formData.get("description") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    faviconUrl: String(formData.get("faviconUrl") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: dictionary.siteSettings.saveError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.siteSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        siteName: parsed.data.siteName,
        description: parsed.data.description || null,
        logoUrl: parsed.data.logoUrl || null,
        faviconUrl: parsed.data.faviconUrl || null,
      },
      update: {
        siteName: parsed.data.siteName,
        description: parsed.data.description || null,
        logoUrl: parsed.data.logoUrl || null,
        faviconUrl: parsed.data.faviconUrl || null,
      },
    });

    revalidateAll();

    return { success: dictionary.siteSettings.saveSuccess };
  } catch {
    return { error: dictionary.siteSettings.saveError };
  }
}
