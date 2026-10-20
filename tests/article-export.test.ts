import test from "node:test";
import assert from "node:assert/strict";
import { ArticleStatus } from "@/generated/prisma/enums";
import { resolveImportArticle } from "@/lib/articles/import";
import {
  buildAttachmentContentDisposition,
  getArticleExportFileName,
  serializeArticleMarkdown,
} from "@/lib/articles/export";

test("exported markdown round-trips through the importer", () => {
  const article = {
    path: "guides/setup",
    title: 'Setup: "快速" 开始',
    description: "A short: description",
    tags: ["nextjs", "cms: basics"],
    editor: "markdown",
    markdown: "Body copy\n\n## Section\n\n# Not the title",
    status: ArticleStatus.PUBLISHED,
    publishedAt: new Date("2025-02-19T04:19:25.509Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
  };

  const output = serializeArticleMarkdown(article);

  assert.match(output, /^---\n/u);
  assert.match(output, /\npublished: true\n/u);
  assert.match(output, /\ndate: 2025-02-19T04:19:25\.509Z\n/u);

  const imported = resolveImportArticle("guides/setup.md", output);

  assert.equal(imported.path, "guides/setup");
  assert.equal(imported.title, article.title);
  assert.equal(imported.description, article.description);
  assert.deepEqual(imported.tags, article.tags);
  assert.equal(imported.editor, article.editor);
  assert.equal(imported.statusOverride, ArticleStatus.PUBLISHED);
  assert.equal(
    imported.publishedAtOverride?.toISOString(),
    article.publishedAt.toISOString(),
  );
  assert.equal(imported.markdown.trim(), article.markdown.trim());
  assert.deepEqual(imported.warnings, []);
});

test("drafts export without publishedAt and fall back to the creation date", () => {
  const output = serializeArticleMarkdown({
    path: "",
    title: "Home",
    description: null,
    tags: [],
    editor: null,
    markdown: "",
    status: ArticleStatus.DRAFT,
    publishedAt: null,
    createdAt: new Date("2024-06-01T12:00:00.000Z"),
  });

  assert.match(output, /\npublished: false\n/u);
  assert.match(output, /\ndate: 2024-06-01T12:00:00\.000Z\n/u);
  assert.doesNotMatch(output, /\ndescription:/u);
  assert.doesNotMatch(output, /\ntags:/u);
  assert.doesNotMatch(output, /\neditor:/u);
  assert.match(output, /\n# Home\n$/u);

  const imported = resolveImportArticle("index.md", output);
  assert.equal(imported.path, "");
  assert.equal(imported.title, "Home");
  assert.equal(imported.statusOverride, ArticleStatus.DRAFT);
  assert.equal(imported.publishedAtOverride?.toISOString(), "2024-06-01T12:00:00.000Z");
});

test("export file names follow the path and stay safe for headers", () => {
  assert.equal(getArticleExportFileName({ path: "" }), "index.md");
  assert.equal(getArticleExportFileName({ path: "guides/next-16" }), "next-16.md");
  assert.equal(getArticleExportFileName({ path: "指南/入门" }), "入门.md");

  const disposition = buildAttachmentContentDisposition('指南/"入门".md');
  assert.match(disposition, /^attachment; filename="/u);
  assert.match(disposition, /filename\*=UTF-8''/u);
  assert.ok(disposition.includes(encodeURIComponent('指南/"入门".md')));
});
