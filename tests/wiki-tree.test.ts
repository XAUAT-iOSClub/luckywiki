import test from "node:test";
import assert from "node:assert/strict";
import { buildWikiTree } from "@/lib/wiki-tree";

test("builds a virtual tree from paths", () => {
  const tree = buildWikiTree([
    { path: "", title: "Home" },
    { path: "guides", title: "Guides landing" },
    { path: "guides/next-16/setup", title: "Setup" },
    { path: "guides/next-16/routing", title: "Routing" },
  ]);

  assert.equal(tree.articleTitle, "Home");
  assert.equal(tree.children[0]?.path, "guides");
  assert.equal(tree.children[0]?.articleTitle, "Guides landing");
  assert.deepEqual(
    tree.children[0]?.children[0]?.children.map((child) => child.path),
    ["guides/next-16/routing", "guides/next-16/setup"],
  );
});
