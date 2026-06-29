import { cache } from "react";

const SITE_URL = (process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000");
const DEFAULT_SITE_SETTINGS = {
  siteName: "LuckyWiki",
  description: null,
  logoUrl: null,
  faviconUrl: null,
  footerCopyright: null,
  footerIcp: null,
};

export function getSiteUrl() {
  return SITE_URL;
}

export function getMetadataBase() {
  return new URL(SITE_URL);
}

export const getSiteSettings = cache(async () => {
  return {
    siteName: readSiteString("SITE_NAME") ?? DEFAULT_SITE_SETTINGS.siteName,
    description: readSiteString("SITE_DESCRIPTION") ?? DEFAULT_SITE_SETTINGS.description,
    logoUrl: readSiteString("SITE_LOGO_URL") ?? DEFAULT_SITE_SETTINGS.logoUrl,
    faviconUrl: readSiteString("SITE_FAVICON_URL") ?? DEFAULT_SITE_SETTINGS.faviconUrl,
    footerCopyright:
      readSiteString("SITE_FOOTER_COPYRIGHT") ?? DEFAULT_SITE_SETTINGS.footerCopyright,
    footerIcp: readSiteString("SITE_FOOTER_ICP") ?? DEFAULT_SITE_SETTINGS.footerIcp,
  };
});

export async function getSiteName() {
  const settings = await getSiteSettings();
  return settings.siteName;
}

function readSiteString(key: string) {
  const value = process.env[key]?.trim();
  return value ? value : null;
}
