import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { syncArticleMediaReferences } from "@/lib/media/references";
import { extractMediaUrls, normalizeMediaUrl } from "@/lib/media/urls";

test("extracts Markdown and HTML image urls", () => {
  const markdown = [
    "![Campus card](https://cdn.example.com/card.webp)",
    '![Logo](https://cdn.example.com/logo.png "Logo title")',
    '<img src="https://cdn.example.com/html.jpg" alt="HTML" />',
    "![Reference][logo]",
    "",
    "[logo]: https://cdn.example.com/reference.svg",
  ].join("\n");

  assert.deepEqual(extractMediaUrls(markdown), [
    "https://cdn.example.com/card.webp",
    "https://cdn.example.com/logo.png",
    "https://cdn.example.com/reference.svg",
    "https://cdn.example.com/html.jpg",
  ]);
});

test("normalizes urls and drops non-http schemes", () => {
  assert.equal(
    normalizeMediaUrl(" https://cdn.example.com/a.png?width=10#preview "),
    "https://cdn.example.com/a.png",
  );
  assert.equal(
    normalizeMediaUrl("//cdn.example.com/a.png"),
    "https://cdn.example.com/a.png",
  );
  assert.equal(
    normalizeMediaUrl("https://cdn.example.com/a.png?x=1&amp;y=2"),
    "https://cdn.example.com/a.png",
  );
  assert.equal(normalizeMediaUrl("data:image/png;base64,abc"), null);
  assert.equal(normalizeMediaUrl("/relative/image.png"), null);
  assert.equal(normalizeMediaUrl(""), null);
});

test("deduplicates repeated image urls", () => {
  const markdown = [
    "![One](https://cdn.example.com/a.png)",
    "![Two](https://cdn.example.com/a.png?size=large)",
    '<img src="https://cdn.example.com/a.png#top" />',
  ].join("\n");

  assert.deepEqual(extractMediaUrls(markdown), [
    "https://cdn.example.com/a.png",
  ]);
});

function createTransaction(options: {
  assets: Array<{ id: string; url: string }>;
  existing: string[];
}) {
  const references = new Set(options.existing);
  const touchedAssets: string[][] = [];
  const tx = {
    mediaAsset: {
      async findMany({ where }: { where: { url: { in: string[] } } }) {
        return options.assets
          .filter((asset) => where.url.in.includes(asset.url))
          .map((asset) => ({ id: asset.id }));
      },
      async updateMany({ where }: { where: { id: { in: string[] } } }) {
        touchedAssets.push(where.id.in);
        return { count: where.id.in.length };
      },
    },
    mediaReference: {
      async findMany() {
        return [...references].map((assetId) => ({ assetId }));
      },
      async deleteMany({ where }: { where: { assetId: { in: string[] } } }) {
        for (const assetId of where.assetId.in) {
          references.delete(assetId);
        }

        return { count: where.assetId.in.length };
      },
      async createMany({ data }: { data: Array<{ assetId: string }> }) {
        for (const reference of data) {
          references.add(reference.assetId);
        }

        return { count: data.length };
      },
    },
  };

  return {
    references,
    touchedAssets,
    tx: tx as unknown as Prisma.TransactionClient,
  };
}

test("syncs article references and refreshes lastUsedAt", async () => {
  const { references, touchedAssets, tx } = createTransaction({
    assets: [
      { id: "asset-a", url: "https://cdn.example.com/a.png" },
      { id: "asset-b", url: "https://cdn.example.com/b.png" },
    ],
    existing: ["asset-c"],
  });
  const now = new Date("2026-10-20T12:00:00.000Z");

  const result = await syncArticleMediaReferences(
    tx,
    "article-1",
    [
      "![A](https://cdn.example.com/a.png)",
      "![B](https://cdn.example.com/b.png?cache=1)",
    ].join("\n"),
    now,
  );

  assert.deepEqual([...references].sort(), ["asset-a", "asset-b"]);
  assert.deepEqual(result, { linked: 2, removed: 1 });
  assert.deepEqual(touchedAssets, [["asset-a", "asset-b"]]);
});

test("removes every reference when the article no longer has images", async () => {
  const { references, touchedAssets, tx } = createTransaction({
    assets: [{ id: "asset-a", url: "https://cdn.example.com/a.png" }],
    existing: ["asset-a"],
  });

  const result = await syncArticleMediaReferences(tx, "article-1", "# No images");

  assert.equal(references.size, 0);
  assert.deepEqual(result, { linked: 0, removed: 1 });
  assert.deepEqual(touchedAssets, []);
});
