import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWikiHref,
  canonicalizePath,
  canonicalizeSlugSegments,
} from "@/lib/wiki-path";

test("canonicalizes mixed-case and Chinese paths", () => {
  assert.equal(canonicalizePath("/指南/Next-16/入门/"), "指南/next-16/入门");
});

test("canonicalizes catch-all slug segments into path", () => {
  assert.equal(
    canonicalizeSlugSegments(["指南", "Next-16", "入门"]),
    "指南/next-16/入门",
  );
});

test("builds hrefs with encoded segments", () => {
  assert.equal(buildWikiHref("指南/next-16/入门"), "/wiki/%E6%8C%87%E5%8D%97/next-16/%E5%85%A5%E9%97%A8");
  assert.equal(buildWikiHref(""), "/wiki");
});

test("rejects invalid path segments", () => {
  assert.throws(() => canonicalizePath("指南/../入门"));
  assert.throws(() => canonicalizePath("指南 /入门"));
});
