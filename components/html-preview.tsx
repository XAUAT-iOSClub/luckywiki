"use client";

import { useMemo } from "react";

type HtmlPreviewProps = {
  html: string;
  className?: string;
};

const TAILWIND_CDN = "https://cdn.tailwindcss.com";

function buildDoc(html: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="${TAILWIND_CDN}"></` + `script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 1.5rem;
    line-height: 1.6;
  }
</style>
</head>
<body>${html}</body>
</html>`;
}

export function HtmlPreview({ html, className }: HtmlPreviewProps) {
  const srcdoc = useMemo(() => buildDoc(html), [html]);

  return (
    <iframe
      className={className}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      title="HTML Preview"
    />
  );
}
