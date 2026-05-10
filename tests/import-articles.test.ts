import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ArticleStatus } from "@/generated/prisma/enums";
import {
  importArticlesFromDirectory,
  type CreateImportArticleInput,
  type ExistingImportArticle,
  type UpdateImportArticleInput,
} from "@/lib/articles/import";

test("dry-run reports planned creates without writing to the repository", async () => {
  const tempDir = await createTempArticleDirectory();
  const created: CreateImportArticleInput[] = [];
  const updated: Array<{ id: string; data: UpdateImportArticleInput }> = [];

  try {
    await writeFile(path.join(tempDir, "index.md"), "# Home\n\nWelcome");
    await mkdir(path.join(tempDir, "guides"), { recursive: true });
    await writeFile(path.join(tempDir, "guides", "setup.md"), "# Setup\n\nSteps");

    const summary = await importArticlesFromDirectory({
      directory: tempDir,
      authorEmail: "root@example.com",
      status: ArticleStatus.PUBLISHED,
      dryRun: true,
      now: () => new Date("2026-05-07T09:00:00.000Z"),
      logger: silentLogger,
      repo: {
        async findUserByEmail(email) {
          return { id: "user-1", email };
        },
        async findArticleByPath() {
          return null;
        },
        async createArticle(data) {
          created.push(data);
        },
        async updateArticle(id, data) {
          updated.push({ id, data });
        },
      },
    });

    assert.deepEqual(summary, {
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 2,
    });
    assert.equal(created.length, 0);
    assert.equal(updated.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("frontmatter can override cli defaults for create", async () => {
  const tempDir = await createTempArticleDirectory();
  const created: CreateImportArticleInput[] = [];

  try {
    await writeFile(
      path.join(tempDir, "index.md"),
      `---
title: Frontmatter Home
description: Imported from YAML
published: true
date: 2025-02-19T04:19:25.509Z
tags: 社团
editor: markdown
---
Welcome
`,
    );

    const summary = await importArticlesFromDirectory({
      directory: tempDir,
      authorEmail: "root@example.com",
      status: ArticleStatus.DRAFT,
      dryRun: false,
      now: () => new Date("2026-05-07T09:00:00.000Z"),
      logger: silentLogger,
      repo: {
        async findUserByEmail(email) {
          return { id: "user-1", email };
        },
        async findArticleByPath() {
          return null;
        },
        async createArticle(data) {
          created.push(data);
        },
        async updateArticle() {
          throw new Error("update should not be called");
        },
      },
    });

    assert.equal(summary.created, 1);
    assert.deepEqual(created[0], {
      path: "",
      title: "Frontmatter Home",
      description: "Imported from YAML",
      tags: ["社团"],
      editor: "markdown",
      markdown: "Welcome\n",
      status: ArticleStatus.PUBLISHED,
      authorId: "user-1",
      publishedAt: new Date("2025-02-19T04:19:25.509Z"),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("updates existing articles by path and preserves frontmatter metadata", async () => {
  const tempDir = await createTempArticleDirectory();
  const updated: Array<{ id: string; data: UpdateImportArticleInput }> = [];
  const existingPublishedAt = new Date("2026-01-01T00:00:00.000Z");

  try {
    await mkdir(path.join(tempDir, "guides"), { recursive: true });
    await writeFile(
      path.join(tempDir, "guides", "setup.md"),
      `---
title: Setup
description: Updated summary
tags:
  - docs
  - next
editor: markdown
---
Updated body`,
    );

    const summary = await importArticlesFromDirectory({
      directory: tempDir,
      authorEmail: "root@example.com",
      status: ArticleStatus.PUBLISHED,
      dryRun: false,
      now: () => new Date("2026-05-07T09:00:00.000Z"),
      logger: silentLogger,
      repo: {
        async findUserByEmail(email) {
          return { id: "user-1", email };
        },
        async findArticleByPath(pathValue) {
          if (pathValue !== "guides/setup") {
            return null;
          }

          return {
            id: "article-1",
            title: "Old title",
            description: null,
            tags: [],
            editor: null,
            markdown: "Old body",
            status: ArticleStatus.PUBLISHED,
            publishedAt: existingPublishedAt,
          } satisfies ExistingImportArticle;
        },
        async createArticle() {
          throw new Error("create should not be called for an existing article");
        },
        async updateArticle(id, data) {
          updated.push({ id, data });
        },
      },
    });

    assert.equal(summary.updated, 1);
    assert.equal(updated.length, 1);
    assert.deepEqual(updated[0], {
      id: "article-1",
      data: {
        title: "Setup",
        description: "Updated summary",
        tags: ["docs", "next"],
        editor: "markdown",
        markdown: "Updated body",
        status: ArticleStatus.PUBLISHED,
        publishedAt: existingPublishedAt,
      },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("fails fast when the import author cannot be resolved", async () => {
  const tempDir = await createTempArticleDirectory();
  let lookedUpExistingArticle = false;

  try {
    await writeFile(path.join(tempDir, "index.md"), "# Home\n\nWelcome");

    await assert.rejects(
      importArticlesFromDirectory({
        directory: tempDir,
        authorEmail: "missing@example.com",
        status: ArticleStatus.PUBLISHED,
        logger: silentLogger,
        repo: {
          async findUserByEmail() {
            return null;
          },
          async findArticleByPath() {
            lookedUpExistingArticle = true;
            return null;
          },
          async createArticle() {
            throw new Error("createArticle should not run");
          },
          async updateArticle() {
            throw new Error("updateArticle should not run");
          },
        },
      }),
      /Author not found/,
    );

    assert.equal(lookedUpExistingArticle, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mixed imports record warnings and file-level failures", async () => {
  const tempDir = await createTempArticleDirectory();
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    await writeFile(
      path.join(tempDir, "good.md"),
      `---
title: Good
unknownField: ignored
---
Body
`,
    );
    await writeFile(
      path.join(tempDir, "bad.md"),
      `---
tags:
  nested: no
---
Body
`,
    );

    const summary = await importArticlesFromDirectory({
      directory: tempDir,
      authorEmail: "root@example.com",
      status: ArticleStatus.PUBLISHED,
      dryRun: true,
      logger: {
        info() {},
        warn(message) {
          warnings.push(message);
        },
        error(message) {
          errors.push(message);
        },
      },
      repo: {
        async findUserByEmail(email) {
          return { id: "user-1", email };
        },
        async findArticleByPath() {
          return null;
        },
        async createArticle() {
          throw new Error("dry-run should not create");
        },
        async updateArticle() {
          throw new Error("dry-run should not update");
        },
      },
    });

    assert.deepEqual(summary, {
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      total: 2,
    });
    assert.match(warnings[0] ?? "", /Ignoring unsupported frontmatter field "unknownField"/);
    assert.match(errors[0] ?? "", /Frontmatter field "tags" must be a string or a string array/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function createTempArticleDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "luckywiki-import-"));
}

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};
