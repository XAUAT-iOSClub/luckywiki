import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImageMarkdown,
  buildImageObjectKey,
  isImageKeyWithinPrefix,
  normalizeImagePathPrefix,
  resolveImagePublicUrl,
  resolveImageStorageKeyForConfig,
} from "@/lib/image-hosting";

test("normalizes image path prefixes", () => {
  assert.equal(normalizeImagePathPrefix("/wiki-assets/uploads/"), "wiki-assets/uploads");
  assert.equal(normalizeImagePathPrefix(""), "");
  assert.equal(normalizeImagePathPrefix(undefined), "");
});

test("builds dated image object keys", () => {
  const key = buildImageObjectKey("My Screenshot.PNG", "image/png", {
    id: "fixed-id",
    now: new Date("2026-05-08T00:00:00.000Z"),
    pathPrefix: "wiki-assets",
  });

  assert.equal(key, "wiki-assets/2026/05/my-screenshot-fixed-id.png");
});

test("builds markdown image snippets with a safe alt text", () => {
  assert.equal(
    buildImageMarkdown("https://cdn.example.com/wiki/demo.png", "Demo [shot]"),
    "![Demo shot](https://cdn.example.com/wiki/demo.png)",
  );
});

test("resolves public image urls", () => {
  assert.equal(
    resolveImagePublicUrl(
      {
        accessKeyId: "key",
        bucket: "demo-bucket",
        publicUrlBase: "https://cdn.example.com/wiki-assets/",
        region: "auto",
        secretAccessKey: "secret",
      },
      "2026/05/demo.png",
    ),
    "https://cdn.example.com/wiki-assets/2026/05/demo.png",
  );
});

test("checks whether a key is inside the configured prefix", () => {
  assert.equal(isImageKeyWithinPrefix("wiki-assets/2026/05/demo.png", "wiki-assets"), true);
  assert.equal(isImageKeyWithinPrefix("wiki-assets", "wiki-assets"), true);
  assert.equal(isImageKeyWithinPrefix("other/2026/05/demo.png", "wiki-assets"), false);
  assert.equal(isImageKeyWithinPrefix("wiki-assets-other/demo.png", "wiki-assets"), false);
  assert.equal(isImageKeyWithinPrefix("anything/demo.png", ""), true);
});

test("resolves storage keys from vercel blob urls", () => {
  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://demo.public.blob.vercel-storage.com/wiki-assets/2026/05/demo.png",
      {
        pathPrefix: "wiki-assets",
        provider: "vercel-blob",
        token: "token",
      },
    ),
    "wiki-assets/2026/05/demo.png",
  );

  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://demo.public.blob.vercel-storage.com/other/demo.png",
      {
        pathPrefix: "wiki-assets",
        provider: "vercel-blob",
        token: "token",
      },
    ),
    null,
  );
});

test("resolves storage keys from S3 and CDN urls", () => {
  const baseConfig = {
    accessKeyId: "key",
    bucket: "demo-bucket",
    pathPrefix: "wiki-assets",
    publicUrlBase: "https://cdn.example.com/wiki-assets",
    region: "auto",
    secretAccessKey: "secret",
  } as const;

  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://cdn.example.com/wiki-assets/wiki-assets/2026/05/demo.png",
      { ...baseConfig, provider: "s3" },
    ),
    "wiki-assets/2026/05/demo.png",
  );

  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://cdn.example.com/wiki-assets/2026/05/demo.png",
      { ...baseConfig, provider: "s3" },
    ),
    "wiki-assets/2026/05/demo.png",
  );

  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://demo-bucket.s3.auto.amazonaws.com/wiki-assets/2026/05/demo.png",
      {
        accessKeyId: "key",
        bucket: "demo-bucket",
        pathPrefix: "wiki-assets",
        region: "auto",
        secretAccessKey: "secret",
        provider: "s3",
      },
    ),
    "wiki-assets/2026/05/demo.png",
  );

  assert.equal(
    resolveImageStorageKeyForConfig(
      "https://example.com/unrelated.png",
      { ...baseConfig, provider: "s3" },
    ),
    null,
  );
});
