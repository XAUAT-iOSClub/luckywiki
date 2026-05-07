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
} from "@/lib/article-import";

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

test("updates existing articles by path and preserves publishedAt when already set", async () => {
  const tempDir = await createTempArticleDirectory();
  const updated: Array<{ id: string; data: UpdateImportArticleInput }> = [];
  const existingPublishedAt = new Date("2026-01-01T00:00:00.000Z");

  try {
    await mkdir(path.join(tempDir, "guides"), { recursive: true });
    await writeFile(path.join(tempDir, "guides", "setup.md"), "# Setup\n\nUpdated body");

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

async function createTempArticleDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "luckywiki-import-"));
}

const silentLogger = {
  info() {},
  error() {},
};
