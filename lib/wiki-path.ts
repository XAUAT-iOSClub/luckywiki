import type { Locale } from "@/lib/i18n/config";
import { localizeHref, stripLocaleFromPathname } from "@/lib/i18n/config";

const forbiddenSegmentPattern = /[\/\\\u0000-\u001F\u007F?#]/u;

export function canonicalizePath(input: string) {
  const normalized = input
    .normalize("NFC")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");

  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").map(validateAndCanonicalizeSegment);

  return segments.join("/");
}

export function canonicalizeSlugSegments(slug?: string[]) {
  if (!slug?.length) {
    return "";
  }

  return canonicalizePath(slug.map((segment) => decodeURIComponent(segment)).join("/"));
}

export function splitPath(path: string) {
  return path ? path.split("/") : [];
}

export function buildWikiHref(path: string, locale: Locale) {
  if (!path) {
    return localizeHref(locale, "/wiki");
  }

  const encoded = splitPath(path).map((segment) => encodeURIComponent(segment));
  return localizeHref(locale, `/wiki/${encoded.join("/")}`);
}

export function getWikiPathFromPathname(pathname: string) {
  const nonLocalizedPath = stripLocaleFromPathname(pathname);

  if (nonLocalizedPath === "/wiki") {
    return "";
  }

  if (!nonLocalizedPath.startsWith("/wiki/")) {
    return "";
  }

  return canonicalizeSlugSegments(nonLocalizedPath.slice("/wiki/".length).split("/"));
}

function validateAndCanonicalizeSegment(segment: string) {
  const trimmed = segment.trim();

  if (!trimmed || trimmed !== segment) {
    throw new Error("Path segments cannot be empty or contain leading/trailing spaces.");
  }

  if (segment === "." || segment === "..") {
    throw new Error("Path segments cannot be '.' or '..'.");
  }

  const lowered = segment.replace(/[A-Z]/g, (char) => char.toLowerCase());

  if (forbiddenSegmentPattern.test(lowered)) {
    throw new Error("Path segments cannot contain slashes, URL query/fragment markers, or control characters.");
  }

  return lowered;
}
