"use client";

type WikiHtmlRendererProps = {
  html: string;
};

export function WikiHtmlRenderer({ html }: WikiHtmlRendererProps) {
  return (
    <div
      className="wiki-html-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
