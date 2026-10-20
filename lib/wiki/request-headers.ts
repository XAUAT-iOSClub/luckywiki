/**
 * Request header populated by the proxy so server components can react to the
 * current wiki path (Next.js does not expose the pathname to layouts).
 *
 * Keep this module free of server-only imports: `proxy.ts` runs outside the
 * React Server Component graph and imports the same constant.
 */
export const WIKI_PATHNAME_HEADER = "x-luckywiki-pathname";
