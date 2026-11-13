import { canonicalizePath, isReservedWikiPath } from "@/lib/wiki/path";

/**
 * Status codes shared by preview, apply and every entry point so a move is
 * rejected with the same reason everywhere.
 */
export type PathChangeStatus =
  | "ok"
  | "same"
  | "invalid"
  | "empty"
  | "not-found"
  | "descendant"
  | "conflict"
  | "reserved"
  | "protected-root"
  | "protected-home"
  | "too-many";

export type PathChangeValidation =
  | { status: "ok"; nextPath: string }
  | { status: Exclude<PathChangeStatus, "ok"> };

/** Paths that must never move: the root article and the default home page. */
export const PROTECTED_ARTICLE_PATHS = new Set(["", "home"]);

export function isDescendantPath(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Replaces a path prefix, leaving the rest of the path untouched. */
export function replacePathPrefix(path: string, from: string, to: string) {
  if (path === from) {
    return to;
  }

  if (path.startsWith(`${from}/`)) {
    return `${to}${path.slice(from.length)}`;
  }

  return path;
}

/**
 * Validates a requested path change before any database planning happens.
 *
 * The target is canonicalized with the same rules as every other path input
 * (`canonicalizePath` lowercases ASCII, trims slashes and rejects empty / `.`
 * / `..` segments and URL markers), so `Guide` and `guide` are the same path.
 */
export function validatePathChangeTarget(
  sourcePath: string,
  nextPathInput: string,
): PathChangeValidation {
  if (!sourcePath) {
    return { status: "protected-root" };
  }

  if (PROTECTED_ARTICLE_PATHS.has(sourcePath)) {
    return { status: "protected-home" };
  }

  let nextPath: string;

  try {
    nextPath = canonicalizePath(nextPathInput.trim());
  } catch {
    return { status: "invalid" };
  }

  if (!nextPath) {
    return { status: "empty" };
  }

  if (nextPath === sourcePath) {
    return { status: "same" };
  }

  if (PROTECTED_ARTICLE_PATHS.has(nextPath)) {
    return { status: "protected-home" };
  }

  if (isReservedWikiPath(nextPath)) {
    return { status: "reserved" };
  }

  if (nextPath.startsWith(`${sourcePath}/`)) {
    return { status: "descendant" };
  }

  return { status: "ok", nextPath };
}

/** Synchronous moves are capped so a Server Action never runs unbounded work. */
export const MAX_SYNC_PATH_MOVE = 200;

/** Upper bound for the link-rewrite scan inside one path change. */
export const MAX_LINK_REWRITE_ARTICLES = 500;
