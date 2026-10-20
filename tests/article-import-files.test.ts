import test from "node:test";
import assert from "node:assert/strict";
import { ArticleStatus } from "@/generated/prisma/enums";
import type { ExistingImportArticle } from "@/lib/articles/import";
import {
  ArticleImportValidationError,
  buildArticleImportPlan,
  normalizeArticleImportPrefix,
  parseArticleImportFiles,
  summarizeArticleImportPlan,
  validateArticleImportBatch,
} from "@/lib/articles/import-files";

test("parses uploaded markdown files under an optional path prefix", () => {
  const parsed = parseArticleImportFiles(
    [
      { name: "index.md", content: "# Home\n\nWelcome\n" },
      { name: "setup.md", content: "# Setup\n\nSteps\n" },
    ],
    { prefix: "Guides/" },
  );

  assert.equal(parsed[0]?.path, "guides");
  assert.equal(parsed[0]?.article?.title, "Home");
  assert.equal(parsed[0]?.article?.markdown, "Welcome\n");
  assert.equal(parsed[1]?.path, "guides/setup");
  assert.equal(parsed[1]?.relativePath, "guides/setup.md");
  assert.equal(parsed[1]?.error, null);
});

test("keeps per-file errors isolated from the rest of the batch", () => {
  const parsed = parseArticleImportFiles([
    { name: "notes.txt", content: "not markdown" },
    { name: "broken.md", content: "---\npublished: yes\n---\nBody" },
    { name: "good.md", content: "# Good\n\nBody\n" },
  ]);

  assert.match(parsed[0]?.error ?? "", /Only \.md files/u);
  assert.match(parsed[1]?.error ?? "", /published.*boolean/u);
  assert.equal(parsed[2]?.error, null);
  assert.equal(parsed[2]?.path, "good");
});

test("marks files that resolve to the same article path as duplicates", () => {
  const parsed = parseArticleImportFiles([
    { name: "guide.md", content: "# One\n\nBody\n" },
    { name: "Guide.md", content: "# Two\n\nBody\n" },
    { name: "other.md", content: "# Other\n\nBody\n" },
  ]);

  assert.match(parsed[0]?.error ?? "", /same article path "guide"/u);
  assert.match(parsed[1]?.error ?? "", /same article path "guide"/u);
  assert.equal(parsed[0]?.article, null);
  assert.equal(parsed[2]?.error, null);
});

test("rejects reserved path prefixes", () => {
  assert.throws(
    () => normalizeArticleImportPrefix("category"),
    ArticleImportValidationError,
  );
  assert.throws(
    () => normalizeArticleImportPrefix("tag/guides"),
    ArticleImportValidationError,
  );
  assert.equal(normalizeArticleImportPrefix(" Guide / Next-16 "), "guide/next-16");
});

test("validates the batch size before parsing", () => {
  assert.throws(
    () => validateArticleImportBatch([]),
    (error: unknown) =>
      error instanceof ArticleImportValidationError && error.code === "NO_FILES",
  );
  assert.throws(
    () =>
      validateArticleImportBatch([
        { name: "big.md", size: 1024 * 1024 + 1 },
      ]),
    (error: unknown) =>
      error instanceof ArticleImportValidationError && error.code === "FILE_TOO_LARGE",
  );
});

test("plans creates, updates, and unchanged articles", () => {
  const parsed = parseArticleImportFiles([
    { name: "new.md", content: "# New\n\nBody\n" },
    { name: "same.md", content: "# Same\n\nSame body\n" },
    { name: "edit.md", content: "# Edit\n\nNew body\n" },
    { name: "broken.md", content: "---\ntitle: ''\n---\nBody" },
  ]);
  const existing = new Map<string, ExistingImportArticle>([
    [
      "same",
      {
        id: "same-id",
        title: "Same",
        description: null,
        tags: [],
        editor: null,
        markdown: "Same body\n",
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ],
    [
      "edit",
      {
        id: "edit-id",
        title: "Edit",
        description: null,
        tags: [],
        editor: null,
        markdown: "Old body\n",
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ],
  ]);
  const items = buildArticleImportPlan(parsed, existing, {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(items[0]?.action, "create");
  assert.equal(items[0]?.path, "new");
  assert.equal(items[0]?.existingId, null);
  assert.equal(items[0]?.publishedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(items[1]?.action, "unchanged");
  assert.equal(items[1]?.existingId, "same-id");
  assert.equal(items[1]?.publishedAt, "2025-01-01T00:00:00.000Z");
  assert.equal(items[2]?.action, "update");
  assert.equal(items[2]?.existingId, "edit-id");
  assert.equal(items[3]?.action, "error");

  assert.deepEqual(summarizeArticleImportPlan(items), {
    create: 1,
    update: 1,
    unchanged: 1,
    error: 1,
    total: 4,
  });
});

test("treats the empty root path as a real article", () => {
  const parsed = parseArticleImportFiles([
    { name: "index.md", content: "# Home\n\nWelcome\n" },
  ]);
  const items = buildArticleImportPlan(parsed, new Map(), {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(items[0]?.path, "");
  assert.equal(items[0]?.action, "create");
  assert.equal(items[0]?.title, "Home");
});

test("detects duplicate root index files", () => {
  const parsed = parseArticleImportFiles([
    { name: "index.md", content: "# One\n\nBody\n" },
    { name: "index.md", content: "# Two\n\nBody\n" },
  ]);

  assert.match(parsed[0]?.error ?? "", /same article path ""/u);
  assert.match(parsed[1]?.error ?? "", /same article path ""/u);
});

test("frontmatter status overrides the batch default", () => {
  const parsed = parseArticleImportFiles([
    {
      name: "draft.md",
      content: "---\npublished: false\n---\n# Draft\n\nBody\n",
    },
  ]);
  const items = buildArticleImportPlan(parsed, new Map(), {
    defaultStatus: ArticleStatus.PUBLISHED,
  });

  assert.equal(items[0]?.status, ArticleStatus.DRAFT);
  assert.equal(items[0]?.publishedAt, null);
});
