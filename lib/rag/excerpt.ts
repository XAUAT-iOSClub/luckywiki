export function buildExcerpt(
  content: string,
  query: string,
  maxLength = 220,
): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_\[\]()!|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const lowerText = text.toLowerCase();

  let index = -1;

  for (const term of terms) {
    const found = lowerText.indexOf(term);
    if (found >= 0) {
      index = found;
      break;
    }
  }

  if (index < 0) {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  const start = Math.max(0, index - 60);
  const excerpt = text.slice(start, start + maxLength);

  return `${start > 0 ? "..." : ""}${excerpt}${
    start + maxLength < text.length ? "..." : ""
  }`;
}
