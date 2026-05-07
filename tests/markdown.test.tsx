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
  assert.match(html, /rounded-3xl border border-slate-200 bg-slate-50\/50/);

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
::GitHubCalendarCard
username: luckyfishes
::

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

  // GitHubCalendarCard
  assert.match(html, /data-mdx-name="GitHubCalendarCard"/);
  assert.match(html, /data-mdx-props="{&quot;username&quot;:&quot;luckyfishes&quot;}"/);

  // Icon (block)
  assert.match(html, /data-mdx-name="Icon"/);
  assert.match(html, /ph:rocket-launch-duotone/);

  // Card
  assert.match(html, /data-mdx-name="Card"/);
  assert.match(html, /custom-class/);
});
