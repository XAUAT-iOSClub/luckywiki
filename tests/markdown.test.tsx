import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/markdown-renderer";

test("markdown renderer supports gfm and strips raw html", () => {
  const html = renderToStaticMarkup(
    <MarkdownRenderer markdown={"# Title\n\n- item\n\n<script>alert(1)</script>"} />,
  );

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<li>item<\/li>/);
  assert.doesNotMatch(html, /script/);
});
