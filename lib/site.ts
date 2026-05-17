import { cache } from "react";
import { prisma } from "@/lib/prisma";

const SITE_URL = (process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000");

export function getSiteUrl() {
  return SITE_URL;
}

export function getMetadataBase() {
  return new URL(SITE_URL);
}

export const getSiteSettings = cache(async () => {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: "default" },
  });

  return {
    siteName: settings?.siteName ?? "LuckyWiki",
    description: settings?.description ?? null,
    logoUrl: settings?.logoUrl ?? null,
    faviconUrl: settings?.faviconUrl ?? null,
  };
});

export async function getSiteName() {
  const settings = await getSiteSettings();
  return settings.siteName;
}
