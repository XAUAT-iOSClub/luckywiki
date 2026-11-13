import type { ArticleStatus } from "@/generated/prisma/enums";

export type WikiPathLookup = {
  /** Article whose `path` equals the requested path, in any status. */
  article: { path: string; status: ArticleStatus } | null;
  /** Redirect row whose `oldPath` equals the requested path. */
  redirect: { path: string; status: ArticleStatus } | null;
};

export type WikiPathResolution =
  | { type: "none" }
  | { type: "redirect"; path: string }
  | { type: "gone" };

// Short TTL: a "no redirect" answer becomes wrong the moment an article moves,
// and the proxy bundle cannot always be reached by the Server Action that
// clears the cache. Five seconds bounds that inconsistency while still
// absorbing bursts of requests to the same page.
const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 1_000;

type CacheEntry = {
  expiresAt: number;
  resolution: WikiPathResolution;
};

/**
 * The proxy is compiled into its own bundle, so a module-level Map would not be
 * shared with Server Actions that want to invalidate it. Keeping the map on
 * `globalThis` makes invalidation work where the bundles share a JS global
 * (single-process deployments); otherwise invalidation degrades to the TTL.
 */
const globalForRedirectCache = globalThis as unknown as {
  __luckyWikiPathResolutionCache?: Map<string, CacheEntry>;
};

const resolutionCache =
  globalForRedirectCache.__luckyWikiPathResolutionCache ??
  new Map<string, CacheEntry>();

globalForRedirectCache.__luckyWikiPathResolutionCache = resolutionCache;

/**
 * Resolution order is security sensitive: the exact article always wins over a
 * redirect row, so a draft that occupies an old path can never leak through a
 * redirect that points at another article.
 *
 * - published article        → render (no redirect)
 * - archived article         → 410
 * - draft article            → 404 (handled by the page, no redirect)
 * - redirect to published    → 308 to the article's current path
 * - redirect to archived     → 410
 * - redirect to draft        → 404 (no leak)
 */
export function resolveWikiPathDecision(
  requestedPath: string,
  lookup: WikiPathLookup,
): WikiPathResolution {
  if (lookup.article) {
    switch (lookup.article.status) {
      case "PUBLISHED":
        return { type: "none" };
      case "ARCHIVED":
        return { type: "gone" };
      default:
        return { type: "none" };
    }
  }

  if (!lookup.redirect) {
    return { type: "none" };
  }

  if (lookup.redirect.status === "PUBLISHED" && lookup.redirect.path !== requestedPath) {
    return { type: "redirect", path: lookup.redirect.path };
  }

  if (lookup.redirect.status === "ARCHIVED") {
    return { type: "gone" };
  }

  return { type: "none" };
}

export function readWikiPathResolutionCache(path: string): WikiPathResolution | null {
  const entry = resolutionCache.get(path);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    resolutionCache.delete(path);
    return null;
  }

  return entry.resolution;
}

export function writeWikiPathResolutionCache(path: string, resolution: WikiPathResolution) {
  if (resolutionCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = resolutionCache.keys().next().value;

    if (oldestKey !== undefined) {
      resolutionCache.delete(oldestKey);
    }
  }

  resolutionCache.set(path, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    resolution,
  });
}

/** Best-effort invalidation for the current process after a path change. */
export function clearWikiPathResolutionCache() {
  resolutionCache.clear();
}

export const WIKI_PATH_RESOLUTION_CACHE_TTL_MS = CACHE_TTL_MS;
