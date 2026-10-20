import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const disallowedUrlPattern = /^(?:data|blob|file|javascript|mailto):/iu;
const htmlImagePattern =
  /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
const markdownImagePattern =
  /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
const protocolPattern = /^https?:\/\//iu;

type MarkdownImageNode = {
  identifier?: string;
  type: string;
  url?: string | null;
};

type MarkdownDefinitionNode = {
  identifier?: string;
  type: string;
  url?: string | null;
};

/**
 * Normalizes an image URL so article bodies and stored assets compare equal.
 * Query strings and fragments are dropped because blob/CDN URLs never need
 * them to identify the object.
 */
export function normalizeMediaUrl(input: string): string | null {
  let value = input.trim();

  if (!value) {
    return null;
  }

  value = value.replaceAll("&amp;", "&").replace(/^<|>$/gu, "").trim();

  if (!value || disallowedUrlPattern.test(value)) {
    return null;
  }

  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  if (!protocolPattern.test(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extracts every image URL referenced by an article body. Markdown images are
 * parsed properly (titles, reference definitions, nested brackets), while HTML
 * <img> tags are handled with a small regex because they are raw HTML nodes.
 */
export function extractMediaUrls(markdown: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const addUrl = (value: string | null | undefined) => {
    if (!value) {
      return;
    }

    const normalized = normalizeMediaUrl(value);

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    urls.push(normalized);
  };

  try {
    const tree = markdownParser.parse(markdown);
    const definitions = new Map<string, string>();

    visit(tree, "definition", (node: unknown) => {
      const definition = node as MarkdownDefinitionNode;

      if (definition.identifier && definition.url) {
        definitions.set(definition.identifier.toLowerCase(), definition.url);
      }
    });

    const visitImage = (node: unknown) => {
      const imageNode = node as MarkdownImageNode;

      if (imageNode.type === "image") {
        addUrl(imageNode.url);
        return;
      }

      if (imageNode.type === "imageReference" && imageNode.identifier) {
        addUrl(definitions.get(imageNode.identifier.toLowerCase()));
      }
    };

    visit(tree, "image", visitImage);
    visit(tree, "imageReference", visitImage);
  } catch {
    // Malformed Markdown should not break article saves. The regex fallback
    // below still finds the common inline image syntax.
  }

  for (const match of markdown.matchAll(markdownImagePattern)) {
    addUrl(match[1] ?? match[2]);
  }

  for (const match of markdown.matchAll(htmlImagePattern)) {
    addUrl(match[1] ?? match[2] ?? match[3]);
  }

  return urls;
}
