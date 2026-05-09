"use client";

import type { ElementType } from "react";
import {
  createCodeFenceComponentPlugin,
  createCustomSyntaxRemarkPlugin,
  rehypeFootnotesHeading,
  remarkSuperSub,
} from "@luckyfishes/markdown-core";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components, Options as ReactMarkdownOptions } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { markdownComponentRenderers } from "@/components/markdown-custom-components";
import { rehypeMdxJsxElements } from "@/lib/markdown-mdx-elements";
import { cn } from "@/lib/utils";
import { visit } from "unist-util-visit";

const remarkRehypeOptions = {
  passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"] as never[],
};

function extractTabsLabelBlocks(markdown: string) {
  const blocks: string[][] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";

    if (line !== "::tabs") {
      index += 1;
      continue;
    }

    index += 1;
    const yamlLines: string[] = [];

    while (index < lines.length) {
      const current = lines[index]?.trim() ?? "";

      if (current === "---" || current === "::") {
        break;
      }

      yamlLines.push(lines[index] ?? "");
      index += 1;
    }

    blocks.push(parseTabsLabelsFromYaml(yamlLines.join("\n")));

    while (index < lines.length && (lines[index]?.trim() ?? "") !== "::") {
      index += 1;
    }

    if ((lines[index]?.trim() ?? "") === "::") {
      index += 1;
    }
  }

  return blocks;
}

function parseTabsLabelsFromYaml(yamlSource: string) {
  const labels: string[] = [];
  const lines = yamlSource.split(/\r?\n/);
  let inTabsList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("tabs:")) {
      const inlineArrayMatch = line.match(/^tabs:\s*\[(.*)\]\s*$/);

      if (inlineArrayMatch) {
        const values = inlineArrayMatch[1] ?? "";
        const matches =
          values.match(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+)/g) ?? [];

        for (const match of matches) {
          const value = match
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .trim();
          if (value) {
            labels.push(value);
          }
        }

        inTabsList = false;
        continue;
      }

      inTabsList = true;
      continue;
    }

    if (inTabsList && /^-\s+/.test(line)) {
      const value = line.replace(/^-\s+/, "").replace(/^['"]|['"]$/g, "").trim();
      if (value) {
        labels.push(value);
      }
      continue;
    }

    if (inTabsList && /^[A-Za-z][\w-]*:/.test(line)) {
      inTabsList = false;
    }
  }

  return labels;
}

function remarkFixTabsLabels(markdown: string) {
  const tabLabelBlocks = extractTabsLabelBlocks(markdown);

  return (tree: unknown) => {
    if (!tree || typeof tree !== "object") {
      return;
    }

    let blockIndex = 0;

    visit(tree as Parameters<typeof visit>[0], "mdxJsxFlowElement", (node: any) => {
      if (node?.name !== "Tabs") {
        return;
      }

      const labels = tabLabelBlocks[blockIndex] ?? [];
      blockIndex += 1;

      if (labels.length === 0) {
        return;
      }

      let triggerIndex = 0;

      const walk = (current: any) => {
        if (!current || triggerIndex >= labels.length) {
          return;
        }

        if (
          current.type === "mdxJsxFlowElement" &&
          current.name === "TabsTrigger"
        ) {
          const label = labels[triggerIndex];
          if (label) {
            current.children = [{ type: "text", value: label }];
          }
          triggerIndex += 1;
          return;
        }

        if (Array.isArray(current.children)) {
          current.children.forEach(walk);
        }
      };

      walk(node);
    });
  };
}

function rehypeExtractMermaid() {
  return (tree: import("hast").Root) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "element", (node: any) => {
      if (node.tagName === "pre" && node.children?.[0]?.tagName === "code") {
        const codeNode = node.children[0];
        const className = codeNode.properties?.className || [];
        if (
          Array.isArray(className) &&
          className.includes("language-mermaid")
        ) {
          // Replace the whole 'pre' node with 'mdx-mermaid'
          node.tagName = "mdx-mermaid";
          node.properties = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chart: (codeNode.children[0] as any).value,
          };
          node.children = [];
        }
      }
    });
  };
}

function remarkAlert() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "blockquote", (node: any) => {
      const firstChild = node.children[0];
      if (firstChild?.type === "paragraph") {
        const firstText = firstChild.children[0];
        if (firstText?.type === "text") {
          const match = firstText.value.match(
            /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(?:\n|$)/i,
          );
          if (match) {
            const type = match[1].toUpperCase();
            node.data = node.data || {};
            node.data.hName = "mdx-alert";
            node.data.hProperties = { type };

            // Remove the [!TYPE] marker
            firstText.value = firstText.value.replace(
              /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(?:\n|$)/i,
              "",
            );

            // If the paragraph is now empty, remove it
            if (firstText.value === "" && firstChild.children.length === 1) {
              node.children.shift();
            } else if (firstText.value === "") {
              firstChild.children.shift();
            }
          }
        }
      }
    });
  };
}

const customTagNames = [
  "mdx-badge",
  "mdx-tip",
  "mdx-tabs",
  "mdx-tabs-list",
  "mdx-tabs-trigger",
  "mdx-tabs-content",
  "mdx-component-block",
  "mdx-component-inline",
  "mdx-mermaid",
  "mdx-alert",
];

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "mdx-badge": ["shape"],
    "mdx-tip": ["copy", "text", "tip", "value"],
    "mdx-tabs": ["defaultValue"],
    "mdx-tabs-trigger": ["value"],
    "mdx-tabs-content": ["value"],
    "mdx-alert": ["type"],
    "mdx-component-block": [
      "data-language",
      "data-mdx-name",
      "data-mdx-props",
      "spec",
      "chart",
      "score",
      "title",
      "count",
    ],
    "mdx-component-inline": ["data-mdx-name", "data-mdx-props"],
    "mdx-mermaid": ["chart"],
    details: ["className", "open"],
    summary: ["className"],
    input: ["type", "checked", "disabled"],
    code: ["className"],
    pre: ["className"],
    span: ["className"],
    div: ["className"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    ...customTagNames,
    "input",
    "details",
    "summary",
  ],
};

const markdownComponents = markdownComponentRenderers as Record<
  string,
  ElementType
>;
export function MarkdownRenderer({
  markdown,
  linkToSectionLabel = "Link to section",
  className,
}: {
  markdown: string;
  linkToSectionLabel?: string;
  className?: string;
}) {
  const rehypePlugins: NonNullable<ReactMarkdownOptions["rehypePlugins"]> = [
    rehypeExtractMermaid,
    createCodeFenceComponentPlugin,
    rehypeFootnotesHeading,
    rehypeMdxJsxElements,
    rehypeSlug,
    [
      rehypeAutolinkHeadings,
      {
        behavior: "append",
        properties: {
          className: ["anchor"],
          ariaLabel: linkToSectionLabel,
        },
      },
    ],
    [rehypeSanitize, sanitizeSchema],
    rehypeHighlight,
    rehypeKatex,
  ];
  const remarkPlugins: NonNullable<ReactMarkdownOptions["remarkPlugins"]> = [
    remarkAlert,
    createCustomSyntaxRemarkPlugin,
    [remarkFixTabsLabels, markdown],
    [remarkGfm, { singleTilde: false }],
    remarkMath,
    remarkSuperSub,
  ];

  return (
    <div
      className={cn(
        "markdown-body prose prose-slate dark:prose-invert max-w-none",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents as Components}
        rehypePlugins={rehypePlugins as ReactMarkdownOptions["rehypePlugins"]}
        remarkPlugins={remarkPlugins as ReactMarkdownOptions["remarkPlugins"]}
        remarkRehypeOptions={remarkRehypeOptions}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
