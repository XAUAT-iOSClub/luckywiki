import test from "node:test";
import assert from "node:assert/strict";
import {
  extractArticleTitleAndMarkdown,
  fallbackTitleForPath,
  mapRelativeFileToArticlePath,
  resolveImportArticle,
} from "@/lib/article-import";

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
  assert.equal(article.markdown, "Body copy");
});

test("uses Home as the root article fallback title", () => {
  assert.equal(fallbackTitleForPath(""), "Home");
});
