import { YAML_PROP_PREFIX } from "@luckyfishes/markdown-core";

type HastNode = {
  attributes?: Array<{
    name?: string;
    value?: unknown;
  }>;
  children?: HastNode[];
  name?: string;
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
};

const COMPONENT_TAG_NAMES: Record<string, string> = {
  Badge: "mdx-badge",
  Tip: "mdx-tip",
  Tabs: "mdx-tabs",
  TabsList: "mdx-tabs-list",
  TabsTrigger: "mdx-tabs-trigger",
  TabsContent: "mdx-tabs-content",
};

function decodeAttributeValue(value: unknown) {
  if (value === null) {
    return true;
  }

  if (typeof value !== "string") {
    return value;
  }

  if (!value.startsWith(YAML_PROP_PREFIX)) {
    return value;
  }

  try {
    return JSON.parse(decodeURIComponent(value.slice(YAML_PROP_PREFIX.length)));
  } catch {
    return value;
  }
}

function resolveTagName(node: HastNode) {
  const name = node.name ?? "";

  if (name === "details" || name === "summary" || name === "sup" || name === "sub") {
    return name;
  }

  if (name in COMPONENT_TAG_NAMES) {
    return COMPONENT_TAG_NAMES[name];
  }

  return node.type === "mdxJsxTextElement"
    ? "mdx-component-inline"
    : "mdx-component-block";
}

function convertNode(node: HastNode): HastNode {
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const rawProperties = Object.fromEntries(
      (node.attributes ?? []).map((attribute) => [
        attribute.name ?? "",
        decodeAttributeValue(attribute.value),
      ]),
    );

    const isCustom =
      node.name &&
      !(node.name in COMPONENT_TAG_NAMES) &&
      node.name !== "details" &&
      node.name !== "summary" &&
      node.name !== "sup" &&
      node.name !== "sub";

    const properties: Record<string, unknown> = isCustom
      ? {
          "data-mdx-name": node.name,
          "data-mdx-props": JSON.stringify(rawProperties),
        }
      : rawProperties;

    if (node.name && !(node.name in COMPONENT_TAG_NAMES) && !isCustom) {
      properties["data-mdx-name"] = node.name;
    }

    return {
      type: "element",
      tagName: resolveTagName(node),
      properties,
      children: (node.children ?? []).map(convertNode),
    };
  }

  if (!node.children) {
    return node;
  }

  return {
    ...node,
    children: node.children.map(convertNode),
  };
}

export function rehypeMdxJsxElements() {
  return (tree: HastNode) => {
    const converted = convertNode(tree);
    Object.assign(tree, converted);
  };
}
