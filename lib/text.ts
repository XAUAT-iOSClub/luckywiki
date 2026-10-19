export function extractMarkdownPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*[-*]\s\[(?: |x)\]\s+/gim, "")
    .replace(/[*_~|]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function extractMarkdownDescription(markdown: string, maxLength = 160) {
  const text = extractMarkdownPlainText(markdown)
    .replace(/\s+/g, " ")
    .trim();

  return truncateDescription(text, maxLength);
}

export function truncateDescription(text: string, maxLength = 160) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function resolveArticleDescription(
  description: string | null | undefined,
  markdown: string,
  maxLength = 160,
) {
  const normalized = description?.replace(/\s+/g, " ").trim();

  if (normalized) {
    return truncateDescription(normalized, maxLength);
  }

  return extractMarkdownDescription(markdown, maxLength);
}
