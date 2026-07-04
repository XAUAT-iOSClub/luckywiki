import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import mermaid from "mermaid";
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
  assert.match(html, /<li[^>]*>item<\/li>/);
  assert.doesNotMatch(html, /script/);
});

test("markdown renderer supports math, mermaid, and code highlighting", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer
        markdown={`
# Test Math
Inline $E=mc^2$ and block:
$$
a^2 + b^2 = c^2
$$

# Test Mermaid
\`\`\`mermaid
graph TD;
    A-->B;
\`\`\`

# Test Code Highlighting
\`\`\`typescript
const x: number = 1;
\`\`\`

# Test GFM Task Lists
- [ ] Task 1
- [x] Task 2
`}
      />
    </I18nProvider>,
  );

  // Math
  assert.match(html, /katex/);
  assert.match(html, /katex-mathml/);
  assert.match(html, /katex-html/);
  assert.match(html, /katex-display/);

  // Mermaid (mapped to mdx-mermaid, which renders as a div with specific classes)
  assert.match(html, /flex justify-center/);
  assert.match(html, /rounded-3xl border/);
  assert.match(html, /bg-muted\/20/);

  // Code Highlighting (rehype-highlight adds hljs classes)
  assert.match(html, /code/);
  assert.match(html, /hljs/);
  assert.match(html, /language-typescript/);

  // GFM Task Lists
  assert.match(html, /input/);
  assert.match(html, /type="checkbox"/);
});

test("markdown renderer supports custom components and attributes", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer
        markdown={`
::Icon
icon: ph:rocket-launch-duotone
::

::Card
className: custom-class
---
Card content
::
`}
      />
    </I18nProvider>,
  );

  // Icon (block)
  assert.match(html, /data-mdx-name="Icon"/);
  assert.match(html, /ph:rocket-launch-duotone/);

  // Card
  assert.match(html, /data-mdx-name="Card"/);
  assert.match(html, /custom-class/);
});

test("markdown renderer preserves explicit tabs labels", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer
        markdown={`
::tabs
tabs: ["社团官网", "iOS 社团AI", "建大Wiki/百科"]

---
第一屏

---
第二屏

---
第三屏
::
`}
      />
    </I18nProvider>,
  );

  assert.match(html, /社团官网/);
  assert.match(html, /iOS 社团AI/);
  assert.match(html, /建大Wiki\/百科/);
  assert.doesNotMatch(html, /Tab 1/);
  assert.match(html, /data-slot="tabs"/);
  assert.match(html, /data-slot="tabs-list"/);
  assert.match(html, /data-slot="tabs-trigger"/);
  assert.match(html, /data-slot="tabs-content"/);
});

test("markdown renderer can render the 社团总览 article with multiple tabs blocks", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const markdown = await readFile(
    new URL("../articles/社团简介/社团总览.md", import.meta.url),
    "utf8",
  );

  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      <I18nProvider dictionary={en} locale="en">
        <MarkdownRenderer markdown={markdown} />
      </I18nProvider>,
    );
  });
});

test("markdown renderer degrades gracefully when custom tabs syntax is malformed", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");

  assert.doesNotThrow(() => {
    const html = renderToStaticMarkup(
      <I18nProvider dictionary={en} locale="en">
        <MarkdownRenderer
          markdown={`
## Before

::tabs
tabs: ["One", "Two"]

---
First panel

::tabs
tabs: ["Nested start without close"]

Regular paragraph after the broken block.
`}
        />
      </I18nProvider>,
    );

    assert.match(html, /Before/);
    assert.match(html, /Regular paragraph after the broken block\./);
  });
});

test("markdown renderer keeps footnotes referenced inside tabs and preserves link targets", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer
        markdown={`
Outside footnote[^outside]

::tabs
tabs: ["One", "Two"]

---
Inside first tab[^tab-one]

---
Inside second tab[^tab-two]
::

[^outside]: outside note
[^tab-one]: first tab note
[^tab-two]: second tab note
`}
      />
    </I18nProvider>,
  );

  assert.match(html, /id="user-content-fnref-outside"/);
  assert.match(html, /id="user-content-fnref-tab-one"/);
  assert.match(html, /id="user-content-fn-outside"/);
  assert.match(html, /id="user-content-fn-tab-one"/);
  assert.match(html, /id="user-content-fn-tab-two"/);
  assert.match(html, /href="#user-content-fn-outside"/);
  assert.match(html, /href="#user-content-fnref-tab-two"/);
  assert.doesNotMatch(html, /user-content-user-content-/);
});

test("markdown renderer aligns heading anchor hrefs with generated ids", async () => {
  const { MarkdownRenderer } = await import("@/components/markdown-renderer");
  const html = renderToStaticMarkup(
    <I18nProvider dictionary={en} locale="en">
      <MarkdownRenderer markdown={"# Title\n\n## Section"} />
    </I18nProvider>,
  );

  assert.match(html, /<h1 id="user-content-title"[^>]*>Title<a class="" aria-label="Link to section" href="#user-content-title">/);
  assert.match(html, /<h2 id="user-content-section"[^>]*>Section<a class="" aria-label="Link to section" href="#user-content-section">/);
});

test("markdown mermaid normalizer converts multiline sequence notes into a Mermaid 11 compatible form", async () => {
  const { normalizeMermaidChart } = await import(
    "@/components/markdown-custom-components"
  );

  const chart = `sequenceDiagram
    Alice ->> Bob: Hello Bob, how are you?
    Bob-->>John: How about you John?
    Bob--x Alice: I am good thanks!
    Bob-x John: I am good thanks!
    Note right of John: Bob thinks a long
long time, so long
that the text does
not fit on a row.

    Bob-->Alice: Checking with John...
    Alice->John: Yes... John, how are you?`;

  const normalized = normalizeMermaidChart(chart);

  assert.match(
    normalized,
    /Note right of John: Bob thinks a long<br\/>long time, so long<br\/>that the text does<br\/>not fit on a row\./,
  );

  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
  await assert.doesNotReject(() => mermaid.parse(normalized));
});
