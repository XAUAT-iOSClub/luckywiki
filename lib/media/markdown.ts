const defaultAltText = "image";

/**
 * Pure helpers shared by the server upload route and the client-side media
 * picker. Keep this module free of Node-only dependencies so it can be
 * imported from client components.
 */
export function sanitizeImageAltText(altText: string) {
  return altText
    .trim()
    .replace(/[\[\]]/gu, "")
    .replace(/\s+/gu, " ");
}

export function buildImageMarkdown(url: string, altText = defaultAltText) {
  const safeAltText = sanitizeImageAltText(altText);

  return `![${safeAltText || defaultAltText}](${url})`;
}

export function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildImageHtml(url: string, altText = defaultAltText) {
  const safeAltText = sanitizeImageAltText(altText);

  return `<img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(safeAltText || defaultAltText)}" />`;
}
