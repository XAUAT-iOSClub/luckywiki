import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkRewritePatterns,
  planLinkRewrite,
  rewriteArticleLinks,
} from "@/lib/articles/link-rewrite";

const articleMove = [{ from: "guide/a", to: "guide/b" }];

test("rewrites locale-prefixed markdown links and nested paths", () => {
  const markdown = [
    "[一节](/zh/wiki/guide/a)",
    "[子页](/en/wiki/guide/a/child?tab=1#intro)",
  ].join("\n");
  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 2);
  assert.match(result.markdown, /\]\(\/zh\/wiki\/guide\/b\)/);
  assert.match(result.markdown, /\]\(\/en\/wiki\/guide\/b\/child\?tab=1#intro\)/);
});

test("rewrites links without a locale prefix", () => {
  const result = rewriteArticleLinks("[x](/wiki/guide/a/child)", articleMove);

  assert.equal(result.count, 1);
  assert.equal(result.markdown, "[x](/wiki/guide/b/child)");
});

test("rewrites percent-encoded chinese paths and keeps the encoding style", () => {
  const rules = [{ from: "指南", to: "手册" }];
  const encoded = `[x](/zh/wiki/${encodeURIComponent("指南")}/${encodeURIComponent("入门")})`;
  const result = rewriteArticleLinks(encoded, rules);

  assert.equal(result.count, 1);
  assert.equal(
    result.markdown,
    `[x](/zh/wiki/${encodeURIComponent("手册")}/${encodeURIComponent("入门")})`,
  );

  const raw = "[x](/zh/wiki/指南/入门)";
  assert.equal(rewriteArticleLinks(raw, rules).markdown, "[x](/zh/wiki/手册/入门)");
});

test("rewrites html href attributes and image links", () => {
  const markdown = [
    '<a href="/zh/wiki/guide/a">entry</a>',
    "![cover](/zh/wiki/guide/a/cover.png)",
  ].join("\n");
  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 2);
  assert.match(result.markdown, /href="\/zh\/wiki\/guide\/b"/);
  assert.match(result.markdown, /!\[cover\]\(\/zh\/wiki\/guide\/b\/cover.png\)/);
});

test("skips fenced code blocks, inline code and code html", () => {
  const markdown = [
    "```md",
    "[inside](/zh/wiki/guide/a)",
    "```",
    "inline `[inside](/zh/wiki/guide/a)` code",
    "<pre>[inside](/zh/wiki/guide/a)</pre>",
    "[outside](/zh/wiki/guide/a)",
  ].join("\n");
  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 1);
  assert.ok(result.markdown.includes("[inside](/zh/wiki/guide/a)"));
  assert.ok(result.markdown.endsWith("[outside](/zh/wiki/guide/b)"));
});

test("skips foreign domains, mailto links and anchors", () => {
  const markdown = [
    "[ext](https://other.example.com/zh/wiki/guide/a)",
    "[mail](mailto:editor@example.com)",
    "[anchor](#guide-a)",
  ].join("\n");

  assert.equal(rewriteArticleLinks(markdown, articleMove).count, 0);
});

test("rewrites same-site absolute urls when the site url is known", () => {
  const markdown =
    "[share](https://baike.example.com/en/wiki/guide/a?from=share#top)";
  const result = rewriteArticleLinks(markdown, articleMove, {
    siteUrl: "https://baike.example.com",
  });

  assert.equal(result.count, 1);
  assert.equal(
    result.markdown,
    "[share](https://baike.example.com/en/wiki/guide/b?from=share#top)",
  );

  // Without a configured site URL, absolute URLs are left untouched.
  assert.equal(rewriteArticleLinks(markdown, articleMove).count, 0);
});

test("respects path segment boundaries", () => {
  const result = rewriteArticleLinks("[x](/zh/wiki/guide/abc)", articleMove);

  assert.equal(result.count, 0);
});

test("rewrites reference-style link definitions", () => {
  const markdown = ["[x][id]", "", "[id]: /zh/wiki/guide/a \"Title\""].join("\n");
  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 1);
  assert.ok(result.markdown.includes("[id]: /zh/wiki/guide/b"));
});

test("does not touch links that already point at the new path", () => {
  const markdown = "[x](/zh/wiki/guide/b)";
  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 0);
  assert.equal(result.markdown, markdown);
});

test("protects inline code and fenced code while rewriting the normal link", () => {
  // This is the exact shape users are asked to type in the verification guide:
  // one plain link, one inline-code link, one fenced-code link, one external.
  const markdown = [
    "[子页](/zh/wiki/guide/a/child)",
    "",
    "`[行内代码](/zh/wiki/guide/a)`",
    "",
    "```",
    "[代码块](/zh/wiki/guide/a)",
    "```",
    "",
    "[外链](https://example.com/zh/wiki/guide/a)",
  ].join("\n");

  const result = rewriteArticleLinks(markdown, articleMove);

  assert.equal(result.count, 1);
  assert.ok(result.markdown.includes("[子页](/zh/wiki/guide/b/child)"));
  assert.ok(result.markdown.includes("`[行内代码](/zh/wiki/guide/a)`"));
  assert.ok(result.markdown.includes("```\n[代码块](/zh/wiki/guide/a)\n```"));
  assert.ok(
    result.markdown.includes("[外链](https://example.com/zh/wiki/guide/a)"),
  );
});

test("plans only articles that actually change", () => {
  const plan = planLinkRewrite(
    [
      { id: "1", title: "A", markdown: "[link](/zh/wiki/guide/a)" },
      { id: "2", title: "B", markdown: "no links here" },
      { id: "3", title: "C", markdown: "[other](/zh/wiki/elsewhere)" },
    ],
    articleMove,
  );

  assert.equal(plan.articleCount, 1);
  assert.equal(plan.linkCount, 1);
  assert.equal(plan.articles[0]?.id, "1");
});

test("candidate patterns include raw and encoded prefixes", () => {
  const patterns = buildLinkRewritePatterns([{ from: "指南/入门", to: "手册" }]);

  assert.ok(patterns.includes("指南/入门"));
  assert.ok(
    patterns.includes(
      `${encodeURIComponent("指南")}/${encodeURIComponent("入门")}`,
    ),
  );
});
