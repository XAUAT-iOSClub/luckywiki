import test from "node:test";
import assert from "node:assert/strict";
import { planArticlePathMove } from "@/lib/articles/move";

test("moves a leaf article to a new path", () => {
  assert.deepEqual(
    planArticlePathMove(["guide", "guide/install"], "guide/install", "guide/setup"),
    {
      status: "ok",
      moves: [{ from: "guide/install", to: "guide/setup" }],
    },
  );
});

test("moves nested pages together with their parent", () => {
  assert.deepEqual(
    planArticlePathMove(
      ["docs", "docs/install", "docs/install/linux", "other"],
      "docs",
      "guide",
    ),
    {
      status: "ok",
      moves: [
        { from: "docs", to: "guide" },
        { from: "docs/install", to: "guide/install" },
        { from: "docs/install/linux", to: "guide/install/linux" },
      ],
    },
  );
});

test("moves a nested page up to a free ancestor path", () => {
  assert.deepEqual(
    planArticlePathMove(["a/b", "a/b/x"], "a/b", "a"),
    {
      status: "ok",
      moves: [
        { from: "a/b", to: "a" },
        { from: "a/b/x", to: "a/x" },
      ],
    },
  );
});

test("rejects destinations that collide with an existing page", () => {
  assert.deepEqual(
    planArticlePathMove(["docs", "docs/install", "guide/install"], "docs", "guide"),
    { status: "conflict", path: "guide/install" },
  );
});

test("rejects moving a page inside its own subtree", () => {
  assert.deepEqual(
    planArticlePathMove(["docs", "docs/install"], "docs", "docs/archive"),
    { status: "descendant" },
  );
});

test("reports no-op and invalid destinations", () => {
  assert.deepEqual(
    planArticlePathMove(["docs"], "docs", "docs"),
    { status: "same" },
  );
  assert.deepEqual(
    planArticlePathMove(["docs"], "docs", ""),
    { status: "invalid" },
  );
  assert.deepEqual(
    planArticlePathMove(["other"], "docs", "guide"),
    { status: "invalid" },
  );
});
