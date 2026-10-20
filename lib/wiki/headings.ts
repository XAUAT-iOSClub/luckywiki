import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdownParser = unified().use(remarkParse);

/**
 * Detect whether a markdown document renders any heading.
 *
 * The wiki table of contents is extracted from the rendered DOM on the client,
 * so this is only the server-rendered hint that keeps the article layout from
 * jumping once the TOC mounts. It parses the markdown properly, which means
 * headings inside code fences are not counted.
 */
export function hasMarkdownHeadings(markdown: string): boolean {
  if (!markdown.trim()) {
    return false;
  }

  let found = false;

  visit(markdownParser.parse(markdown), "heading", () => {
    found = true;
  });

  return found;
}

/**
 * Detect whether raw HTML contains a heading the TOC can link to. The TOC only
 * lists headings that have an `id`, so those are the only ones that count.
 */
export function hasHtmlHeadings(html: string): boolean {
  return /<h[1-6]\b[^>]*\sid\s*=\s*(?:"[^"]+"|'[^']+'|[^\s"'>]+)/i.test(html);
}
