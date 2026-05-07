import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/dictionaries/en";

test("markdown renderer supports gfm and strips raw html", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer markdown={"# Title\n\n- item\n\n<script>alert(1)</script>"} />
    </I18nProvider>,
  );

  assert.match(html, /<h1[^>]*>Title/);
  assert.match(html, /<li>item<\/li>/);
  assert.doesNotMatch(html, /script/);
});

test("markdown renderer supports markdown-core custom syntax", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer
        markdown={`:badge[Stable](outline)

:: details [open] Deep Dive
Use :tip[API_KEY](copy) for local testing.
::

::tabs
tabs:
  - Overview
  - Details
---
First tab body.
---
Second tab body.
::

::Callout
title: Example
---
Fallback body
::
`}
      />
    </I18nProvider>,
  );

  assert.match(html, /Stable/);
  assert.match(html, /Deep Dive/);
  assert.match(html, /Copy/);
  assert.match(html, /Overview/);
  assert.match(html, /First tab body\./);
  assert.doesNotMatch(html, /Second tab body\./);
  assert.match(html, /Callout/);
  assert.match(html, /Fallback body/);
});
