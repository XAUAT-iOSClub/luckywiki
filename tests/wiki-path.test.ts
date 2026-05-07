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

test("allows common chinese punctuation used in article filenames", () => {
  assert.equal(
    canonicalizePath("学校/专业简介/土木工程（中外合作办学）"),
    "学校/专业简介/土木工程（中外合作办学）",
  );
  assert.equal(
    canonicalizePath("学校/竞赛/一类B竞赛/“中国软件杯”大学生软件设计大赛"),
    "学校/竞赛/一类b竞赛/“中国软件杯”大学生软件设计大赛",
  );
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
  assert.throws(() => canonicalizePath("指南/入门?test"));
});
