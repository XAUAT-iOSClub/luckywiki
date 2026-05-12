const SITE_URL = (process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000");

export function getSiteUrl() {
  return SITE_URL;
}

export function getMetadataBase() {
  return new URL(SITE_URL);
}
