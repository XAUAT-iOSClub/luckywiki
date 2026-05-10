import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ArticleStatus } from "@/generated/prisma/enums";
import { importArticlesFromDirectory } from "@/lib/articles/import";
import {
  importArticleImagesFromDirectory,
  parseArticleImageImportCliArgs,
  rewriteMarkdownImages,
} from "@/lib/articles/image-import";

test("rewrites local markdown images and deduplicates uploads", async () => {
  const tempDir = await createTempArticleDirectory();
  const articlesRoot = path.join(tempDir, "articles");
  const uploads: Array<{
    absolutePath: string;
    fileName: string;
    format: string | undefined;
    type: string;
  }> = [];

  try {
    await mkdir(path.join(articlesRoot, "社团简介"), { recursive: true });
    await mkdir(path.join(articlesRoot, "图片"), { recursive: true });
    await writeFile(
      path.join(articlesRoot, "图片", "root.png"),
      await createPngBuffer(24, 24, { b: 180, g: 40, r: 40 }),
    );
    await writeFile(
      path.join(articlesRoot, "社团简介", "local.png"),
      await createPngBuffer(32, 24, { b: 40, g: 160, r: 40 }),
    );

    const markdown = [
      '![Root](/图片/root.png "width=320")',
      '![Local](./local.png "height=180")',
      '![Local Again](./local.png)',
      '![Remote](https://example.com/remote.png)',
    ].join("\n\n");

    const result = await rewriteMarkdownImages({
      articlesRootDirectory: articlesRoot,
      markdown,
      markdownFilePath: path.join(articlesRoot, "社团简介", "demo.md"),
      uploadLocalImage: async (file, absolutePath) => {
        const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
        uploads.push({
          absolutePath,
          fileName: file.name,
          format: metadata.format,
          type: file.type,
        });
        return {
          key: absolutePath,
          url: `https://cdn.example.com/${file.name}`,
        };
      },
    });

    assert.equal(result.changed, true);
    assert.equal(result.imagesUploaded, 2);
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0]?.fileName.endsWith(".webp"), true);
    assert.equal(uploads[0]?.type, "image/webp");
    assert.equal(uploads[0]?.format, "webp");
    assert.match(result.markdown, /https:\/\/cdn\.example\.com\/root\.webp/);
    assert.match(result.markdown, /https:\/\/cdn\.example\.com\/local\.webp/);
    assert.match(result.markdown, /"width=320"/);
    assert.match(result.markdown, /https:\/\/example\.com\/remote\.png/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("dry-run scans local images without rewriting files", async () => {
  const tempDir = await createTempArticleDirectory();
  const articlesRoot = path.join(tempDir, "articles");
  const markdownPath = path.join(articlesRoot, "社团简介", "dry-run.md");

  try {
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await mkdir(path.join(articlesRoot, "图片"), { recursive: true });
    await writeFile(
      path.join(articlesRoot, "图片", "preview.png"),
      await createPngBuffer(24, 24, { b: 180, g: 180, r: 40 }),
    );
    const originalMarkdown = "![Preview](/图片/preview.png)\n";
    await writeFile(markdownPath, originalMarkdown);

    const summary = await importArticleImagesFromDirectory({
      directory: articlesRoot,
      dryRun: true,
      logger: silentLogger,
      uploadLocalImage: async () => {
        throw new Error("dry-run should not upload");
      },
    });

    assert.equal(summary.failed, 0);
    assert.equal(summary.changed, 1);
    assert.equal(summary.imagesUploaded, 0);
    assert.equal(await readFile(markdownPath, "utf8"), originalMarkdown);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("missing local images fail cleanly without rewriting the file", async () => {
  const tempDir = await createTempArticleDirectory();
  const articlesRoot = path.join(tempDir, "articles");
  const markdownPath = path.join(articlesRoot, "社团简介", "missing.md");

  try {
    await mkdir(path.dirname(markdownPath), { recursive: true });
    const originalMarkdown = "![Missing](/图片/missing.png)\n";
    await writeFile(markdownPath, originalMarkdown);

    const summary = await importArticleImagesFromDirectory({
      directory: articlesRoot,
      logger: silentLogger,
    });

    assert.equal(summary.failed, 1);
    assert.equal(await readFile(markdownPath, "utf8"), originalMarkdown);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rewritten image markdown feeds the existing article import flow", async () => {
  const tempDir = await createTempArticleDirectory();
  const articlesRoot = path.join(tempDir, "articles");
  const created: Array<{ markdown: string; path: string }> = [];

  try {
    await mkdir(path.join(articlesRoot, "社团简介"), { recursive: true });
    await mkdir(path.join(articlesRoot, "图片"), { recursive: true });
    await writeFile(
      path.join(articlesRoot, "图片", "club.png"),
      await createPngBuffer(24, 24, { b: 120, g: 60, r: 40 }),
    );
    await writeFile(
      path.join(articlesRoot, "社团简介", "club.md"),
      "# Club\n\n![Club](/图片/club.png)\n",
    );

    const rewriteSummary = await importArticleImagesFromDirectory({
      directory: articlesRoot,
      logger: silentLogger,
      uploadLocalImage: async (file, absolutePath) => ({
        key: absolutePath,
        url: `https://cdn.example.com/${file.name}`,
      }),
    });

    assert.equal(rewriteSummary.failed, 0);

    const importSummary = await importArticlesFromDirectory({
      authorEmail: "root@example.com",
      directory: articlesRoot,
      dryRun: false,
      logger: silentLogger,
      now: () => new Date("2026-05-07T09:00:00.000Z"),
      repo: {
        async findUserByEmail(email) {
          return { id: "user-1", email };
        },
        async findArticleByPath() {
          return null;
        },
        async createArticle(data) {
          created.push({
            markdown: data.markdown,
            path: data.path,
          });
        },
        async updateArticle() {
          throw new Error("update should not be called");
        },
      },
      status: ArticleStatus.PUBLISHED,
    });

    assert.equal(importSummary.created, 1);
    assert.equal(created[0]?.path, "社团简介/club");
    assert.match(created[0]?.markdown ?? "", /https:\/\/cdn\.example\.com\/club\.webp/);
    assert.match(
      await readFile(path.join(articlesRoot, "社团简介", "club.md"), "utf8"),
      /https:\/\/cdn\.example\.com\/club\.webp/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("article image import cli args ignore pnpm separators", () => {
  assert.deepEqual(parseArticleImageImportCliArgs(["--", "articles"]), {
    directory: "articles",
    dryRun: false,
  });

  assert.deepEqual(parseArticleImageImportCliArgs(["--", "articles", "--dry-run"]), {
    directory: "articles",
    dryRun: true,
  });
});

async function createTempArticleDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "luckywiki-image-import-"));
}

async function createPngBuffer(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
) {
  return sharp({
    create: {
      channels: 3,
      background,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};
