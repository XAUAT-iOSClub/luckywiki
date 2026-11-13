import test from "node:test";
import assert from "node:assert/strict";
import {
  replacePathPrefix,
  validatePathChangeTarget,
} from "@/lib/articles/path-rules";
import { planArticlePathMove } from "@/lib/articles/move";

test("canonicalizes the target path and reports no-op moves", () => {
  assert.deepEqual(validatePathChangeTarget("guide/a", "  Guide/B  "), {
    status: "ok",
    nextPath: "guide/b",
  });
  assert.deepEqual(validatePathChangeTarget("guide/a", "Guide/A"), {
    status: "same",
  });
});

test("rejects invalid, empty and reserved targets", () => {
  assert.deepEqual(validatePathChangeTarget("guide/a", "guide/../x"), {
    status: "invalid",
  });
  assert.deepEqual(validatePathChangeTarget("guide/a", "  "), {
    status: "empty",
  });
  assert.deepEqual(validatePathChangeTarget("guide/a", "category"), {
    status: "reserved",
  });
  assert.deepEqual(validatePathChangeTarget("guide/a", "tag/nextjs"), {
    status: "reserved",
  });
});

test("protects the root article and the home page", () => {
  assert.deepEqual(validatePathChangeTarget("", "guide/a"), {
    status: "protected-root",
  });
  assert.deepEqual(validatePathChangeTarget("home", "guide/a"), {
    status: "protected-home",
  });
  assert.deepEqual(validatePathChangeTarget("guide/a", "home"), {
    status: "protected-home",
  });
});

test("rejects moving a page inside its own subtree", () => {
  assert.deepEqual(validatePathChangeTarget("guide/a", "guide/a/child"), {
    status: "descendant",
  });
});

test("replacePathPrefix only rewrites whole segments", () => {
  assert.equal(replacePathPrefix("guide/a", "guide/a", "guide/b"), "guide/b");
  assert.equal(
    replacePathPrefix("guide/a/child/deep", "guide/a", "guide/b"),
    "guide/b/child/deep",
  );
  assert.equal(replacePathPrefix("guide/abc", "guide/a", "guide/b"), "guide/abc");
});

test("a folder rename moves a subtree even when the folder is not an article", () => {
  // A folder may itself be an article, so an existing article at the new
  // prefix is not a conflict — only the moved child paths must be free.
  assert.deepEqual(
    planArticlePathMove(
      ["guide/a/child", "guide/a/child/deep", "guide/b"],
      "guide/a",
      "guide/b",
      { requireSourceArticle: false },
    ),
    {
      status: "ok",
      moves: [
        { from: "guide/a/child", to: "guide/b/child" },
        { from: "guide/a/child/deep", to: "guide/b/child/deep" },
      ],
    },
  );

  assert.deepEqual(
    planArticlePathMove(
      ["guide/a/child", "guide/a/child/deep"],
      "guide/a",
      "manual/a",
      { requireSourceArticle: false },
    ),
    {
      status: "ok",
      moves: [
        { from: "guide/a/child", to: "manual/a/child" },
        { from: "guide/a/child/deep", to: "manual/a/child/deep" },
      ],
    },
  );
});

test("a folder rename conflicts when a moved child path is occupied", () => {
  assert.deepEqual(
    planArticlePathMove(
      ["guide/a/child", "guide/b/child"],
      "guide/a",
      "guide/b",
      { requireSourceArticle: false },
    ),
    { status: "conflict", path: "guide/b/child" },
  );
});

test("article moves still require the source article to exist", () => {
  assert.deepEqual(
    planArticlePathMove(["guide/a/child"], "guide/a", "guide/b"),
    { status: "invalid" },
  );
});

test("a folder rename rejects a target inside its own subtree", () => {
  assert.deepEqual(
    planArticlePathMove(
      ["guide/a/child"],
      "guide/a",
      "guide/a/archive",
      { requireSourceArticle: false },
    ),
    { status: "descendant" },
  );
});
