import test from "node:test";
import assert from "node:assert/strict";
import {
  extractArticleTitleAndMarkdown,
  fallbackTitleForPath,
  mapRelativeFileToArticlePath,
  resolveImportArticle,
} from "@/lib/articles/import";

test("maps root index, nested index, and regular markdown files to wiki paths", () => {
  assert.equal(mapRelativeFileToArticlePath("index.md"), "");
  assert.equal(mapRelativeFileToArticlePath("Guides/index.md"), "guides");
  assert.equal(mapRelativeFileToArticlePath("Guides/Next-16/Setup.md"), "guides/next-16/setup");
});

test("canonicalizes chinese and mixed-case file paths", () => {
  assert.equal(mapRelativeFileToArticlePath("指南/Next-16/入门.md"), "指南/next-16/入门");
});

test("extracts the first h1 and removes it from markdown", () => {
  assert.deepEqual(
    extractArticleTitleAndMarkdown("# Hello World\n\nBody copy\n\n## Section", "guides/hello-world"),
    {
      title: "Hello World",
      markdown: "Body copy\n\n## Section",
    },
  );
});

test("falls back to a humanized title when markdown has no h1", () => {
  const article = resolveImportArticle("guides/next-16.md", "Body copy");

  assert.equal(article.path, "guides/next-16");
  assert.equal(article.title, "Next 16");
  assert.equal(article.description, null);
  assert.deepEqual(article.tags, []);
  assert.equal(article.editor, null);
  assert.equal(article.markdown, "Body copy");
});

test("uses Home as the root article fallback title", () => {
  assert.equal(fallbackTitleForPath(""), "Home");
});

test("frontmatter title overrides h1 and is stripped from markdown", () => {
  const article = resolveImportArticle(
    "clubs/crafts.md",
    `---
title: 藏品手工社
description: 手工社简介
published: true
date: 2025-02-19T04:19:25.509Z
tags:
  - 社团
  - 手工
editor: markdown
dateCreated: 2024-11-08T10:22:05.898Z
---
# 页面内标题

正文内容
`,
  );

  assert.equal(article.title, "藏品手工社");
  assert.equal(article.description, "手工社简介");
  assert.deepEqual(article.tags, ["社团", "手工"]);
  assert.equal(article.editor, "markdown");
  assert.equal(article.statusOverride, "PUBLISHED");
  assert.equal(
    article.publishedAtOverride?.toISOString(),
    "2025-02-19T04:19:25.509Z",
  );
  assert.equal(article.markdown, "正文内容\n");
});

test("frontmatter supports single-string tags and warns on unknown fields", () => {
  const article = resolveImportArticle(
    "clubs/crafts.md",
    `---
tags: 社团
unknownField: keep-me-out
---
正文内容
`,
  );

  assert.deepEqual(article.tags, ["社团"]);
  assert.deepEqual(article.warnings, [
    'Ignoring unsupported frontmatter field "unknownField".',
  ]);
});

test("invalid frontmatter types fail fast", () => {
  assert.throws(
    () =>
      resolveImportArticle(
        "clubs/crafts.md",
        `---
published: yes
---
正文内容
`,
      ),
    /Frontmatter field "published" must be a boolean/,
  );

  assert.throws(
    () =>
      resolveImportArticle(
        "clubs/crafts.md",
        `---
date: not-a-date
---
正文内容
`,
      ),
    /Frontmatter field "date" must be a valid date/,
  );
});
