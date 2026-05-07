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
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { markdownComponentRenderers } from "@/components/markdown-custom-components";
import { rehypeMdxJsxElements } from "@/lib/markdown-mdx-elements";

const remarkRehypeOptions = {
  passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"] as never[],
};
const remarkPlugins: NonNullable<ReactMarkdownOptions["remarkPlugins"]> = [
  createCustomSyntaxRemarkPlugin,
  [remarkGfm, { singleTilde: false }],
  remarkSuperSub,
];

const customTagNames = [
  "mdx-badge",
  "mdx-tip",
  "mdx-tabs",
  "mdx-tabs-list",
  "mdx-tabs-trigger",
  "mdx-tabs-content",
  "mdx-component-block",
  "mdx-component-inline",
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
    "mdx-component-block": [
      "data-language",
      "data-mdx-name",
      "spec",
      "chart",
      "score",
      "title",
      "count",
    ],
    "mdx-component-inline": ["data-mdx-name"],
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
  ],
};

const markdownComponents = markdownComponentRenderers as Record<
  string,
  ElementType
>;
export function MarkdownRenderer({
  markdown,
  linkToSectionLabel = "Link to section",
}: {
  markdown: string;
  linkToSectionLabel?: string;
}) {
  const rehypePlugins: NonNullable<ReactMarkdownOptions["rehypePlugins"]> = [
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
  ];

  return (
    <div className="markdown-body">
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
