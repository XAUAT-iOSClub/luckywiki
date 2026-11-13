import { canonicalizePath } from "@/lib/wiki/path";
import { locales } from "@/lib/i18n/config";
import { isDescendantPath, replacePathPrefix } from "@/lib/articles/path-rules";

export type LinkRewriteRule = {
  from: string;
  to: string;
};

export type LinkRewriteResult = {
  markdown: string;
  count: number;
};

export type LinkRewriteCandidate = {
  id: string;
  title: string;
  markdown: string;
};

export type LinkRewriteArticlePlan = {
  id: string;
  title: string;
  markdown: string;
  count: number;
};

export type LinkRewritePlan = {
  articles: LinkRewriteArticlePlan[];
  articleCount: number;
  linkCount: number;
};

const localeSet = new Set<string>(locales);

/**
 * Rewrites internal wiki links that point at moved paths.
 *
 * Handles Markdown inline links, Markdown image links, reference-style
 * definitions and HTML `href` attributes. Skips fenced code blocks, inline
 * code, `<pre>` / `<code>` blocks, `mailto:` / `tel:` / anchor links and
 * foreign domains. Locale prefix, query string and hash are preserved.
 */
export function rewriteArticleLinks(
  markdown: string,
  rules: LinkRewriteRule[],
  options?: { siteUrl?: string | null },
): LinkRewriteResult {
  const normalizedRules = normalizeRules(rules);

  if (!markdown || !normalizedRules.length) {
    return { markdown, count: 0 };
  }

  const siteOrigin = getSiteOrigin(options?.siteUrl);
  let count = 0;

  const rewritten = applyOutsideCode(markdown, (segment) => {
    let next = segment;

    // Markdown inline links and images: [text](target "title")
    next = next.replace(
      /(!?\[[^\]]*\]\()(<[^<>]*>|[^()\s]+)(\s+"[^"]*")?(\))/g,
      (match, prefix: string, rawTarget: string, title: string | undefined, suffix: string) => {
        const target = unwrapAngleBrackets(rawTarget);
        const replacement = rewriteUrl(target, normalizedRules, siteOrigin);

        if (!replacement) {
          return match;
        }

        count += 1;
        return `${prefix}${rawTarget.startsWith("<") ? `<${replacement}>` : replacement}${title ?? ""}${suffix}`;
      },
    );

    // Reference-style definitions: [label]: /zh/wiki/guide/a
    next = next.replace(
      /^([ \t]{0,3}\[[^\]]+\]:[ \t]*)(\S+)/gm,
      (match, prefix: string, target: string) => {
        const replacement = rewriteUrl(target, normalizedRules, siteOrigin);

        if (!replacement) {
          return match;
        }

        count += 1;
        return `${prefix}${replacement}`;
      },
    );

    // HTML anchors: <a href="/zh/wiki/guide/a">
    next = next.replace(
      /(\shref\s*=\s*)(["'])([^"']*)\2/gi,
      (match, prefix: string, quote: string, target: string) => {
        const replacement = rewriteUrl(target, normalizedRules, siteOrigin);

        if (!replacement) {
          return match;
        }

        count += 1;
        return `${prefix}${quote}${replacement}${quote}`;
      },
    );

    return next;
  });

  return { markdown: rewritten, count };
}

/** Applies the rules to every candidate and keeps the articles that change. */
export function planLinkRewrite(
  candidates: LinkRewriteCandidate[],
  rules: LinkRewriteRule[],
  options?: { siteUrl?: string | null },
): LinkRewritePlan {
  const articles: LinkRewriteArticlePlan[] = [];

  for (const candidate of candidates) {
    const result = rewriteArticleLinks(candidate.markdown, rules, options);

    if (result.count > 0 && result.markdown !== candidate.markdown) {
      articles.push({
        id: candidate.id,
        title: candidate.title,
        markdown: result.markdown,
        count: result.count,
      });
    }
  }

  return {
    articles,
    articleCount: articles.length,
    linkCount: articles.reduce((total, article) => total + article.count, 0),
  };
}

/**
 * Substrings used to narrow the database scan (`markdown contains ...`).
 * Includes percent-encoded variants so Chinese folder names match both
 * `[x](/zh/wiki/指南)` and `[x](/zh/wiki/%E6%8C%87%E5%8D%97)`.
 */
export function buildLinkRewritePatterns(rules: LinkRewriteRule[]): string[] {
  const patterns = new Set<string>();

  for (const rule of rules) {
    patterns.add(rule.from);

    const encodedSegments = rule.from
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    patterns.add(encodedSegments);
  }

  return Array.from(patterns).filter(Boolean);
}

function normalizeRules(rules: LinkRewriteRule[]) {
  return rules
    .filter((rule) => rule.from && rule.to && rule.from !== rule.to)
    .sort((left, right) => right.from.length - left.from.length);
}

function getSiteOrigin(siteUrl: string | null | undefined) {
  if (!siteUrl) {
    return null;
  }

  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Splits the markdown into code and non-code ranges, then rewrites only the
 * non-code parts. Code fences that are never closed protect the rest of the
 * document, mirroring how the renderer treats them.
 */
function applyOutsideCode(markdown: string, transform: (segment: string) => string) {
  const ranges = collectCodeRanges(markdown);

  if (!ranges.length) {
    return transform(markdown);
  }

  let output = "";
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      output += transform(markdown.slice(cursor, range.start));
    }

    output += markdown.slice(range.start, range.end);
    cursor = range.end;
  }

  if (cursor < markdown.length) {
    output += transform(markdown.slice(cursor));
  }

  return output;
}

type CodeRange = { start: number; end: number };

function collectCodeRanges(markdown: string) {
  const ranges: CodeRange[] = [];

  for (const match of markdown.matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*(?:\n|$)/gm)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }

  // An unterminated fence protects everything up to the end of the document.
  const unterminatedFence = markdown.lastIndexOf("\n```");
  if (unterminatedFence >= 0) {
    const after = markdown.slice(unterminatedFence + 1);
    const fenceEnd = after.indexOf("\n");
    const fenceLine = fenceEnd >= 0 ? after.slice(0, fenceEnd) : after;

    if (/^ {0,3}(`{3,}|~{3,})/.test(fenceLine) && !isInsideAnyRange(unterminatedFence, ranges)) {
      ranges.push({ start: unterminatedFence + 1, end: markdown.length });
    }
  }

  for (const match of markdown.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>|<code\b[^>]*>[\s\S]*?<\/code>/gi)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }

  for (const match of markdown.matchAll(/(`+)([\s\S]*?)\1/g)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }

  ranges.sort((left, right) => left.start - right.start);

  const merged: CodeRange[] = [];

  for (const range of ranges) {
    const previous = merged[merged.length - 1];

    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function isInsideAnyRange(index: number, ranges: CodeRange[]) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function unwrapAngleBrackets(value: string) {
  return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

function rewriteUrl(
  rawTarget: string,
  rules: LinkRewriteRule[],
  siteOrigin: string | null,
): string | null {
  const target = rawTarget.trim();

  if (!target || target.startsWith("#") || target.startsWith("?")) {
    return null;
  }

  if (/^(mailto|tel|javascript|data):/i.test(target)) {
    return null;
  }

  let pathAndSearch = target;
  let origin: string | null = null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    if (!/^https?:/i.test(target) || !siteOrigin) {
      return null;
    }

    try {
      const parsed = new URL(target);

      if (parsed.origin !== siteOrigin) {
        return null;
      }

      origin = parsed.origin;
      pathAndSearch = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(pathAndSearch);

  if (!match) {
    return null;
  }

  const [, pathname, search = "", hash = ""] = match;

  if (!pathname.startsWith("/")) {
    return null;
  }

  const rewrittenPath = rewritePathname(pathname, rules);

  if (!rewrittenPath) {
    return null;
  }

  return `${origin ?? ""}${rewrittenPath}${search}${hash}`;
}

function rewritePathname(pathname: string, rules: LinkRewriteRule[]) {
  const segments = pathname.split("/").filter(Boolean);
  let localePrefix = "";
  let wikiIndex = 0;

  if (segments.length > 1 && localeSet.has(segments[0])) {
    localePrefix = `/${segments[0]}`;
    wikiIndex = 1;
  }

  if (segments[wikiIndex] !== "wiki" || segments.length <= wikiIndex + 1) {
    return null;
  }

  const articleSegments = segments.slice(wikiIndex + 1);
  const hadEncoding = pathname.includes("%");
  const decodedSegments: string[] = [];

  for (const segment of articleSegments) {
    try {
      decodedSegments.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }

  let articlePath: string;

  try {
    articlePath = canonicalizePath(decodedSegments.join("/"));
  } catch {
    return null;
  }

  if (!articlePath) {
    return null;
  }

  const rule = rules.find((candidate) => isDescendantPath(articlePath, candidate.from));

  if (!rule) {
    return null;
  }

  const nextPath = replacePathPrefix(articlePath, rule.from, rule.to);
  const nextSegments = nextPath.split("/").map((segment) =>
    hadEncoding ? encodeURIComponent(segment) : segment,
  );

  return `${localePrefix}/wiki/${nextSegments.join("/")}`;
}
