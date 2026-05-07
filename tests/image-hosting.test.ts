import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImageMarkdown,
  buildImageObjectKey,
  normalizeImagePathPrefix,
  resolveImagePublicUrl,
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
