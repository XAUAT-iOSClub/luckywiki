import assert from "node:assert";
import test from "node:test";
import { fuseRagCandidates } from "../lib/rag/fusion";
import type { RagCandidate } from "../lib/rag/vector";

test("fuseRagCandidates merges candidates from multiple lists", () => {
  const lexical: RagCandidate[] = [
    {
      chunk_id: "1",
      article_path: "a/b",
      article_title: "Article A",
      heading_path: ["Section 1"],
      content: "Content A",
      score: 0.8,
      match_types: ["lexical"],
      updated_at: new Date(),
    },
    {
      chunk_id: "2",
      article_path: "c/d",
      article_title: "Article B",
      heading_path: ["Section 2"],
      content: "Content B",
      score: 0.6,
      match_types: ["lexical"],
      updated_at: new Date(),
    },
  ];

  const vector: RagCandidate[] = [
    {
      chunk_id: "2",
      article_path: "c/d",
      article_title: "Article B",
      heading_path: ["Section 2"],
      content: "Content B",
      score: 0.9,
      match_types: ["vector"],
      updated_at: new Date(),
    },
    {
      chunk_id: "3",
      article_path: "e/f",
      article_title: "Article C",
      heading_path: ["Section 3"],
      content: "Content C",
      score: 0.7,
      match_types: ["vector"],
      updated_at: new Date(),
    },
  ];

  const fused = fuseRagCandidates([lexical, vector]);

  assert.equal(fused.length, 3);
  assert.ok(fused[0]); // TypeScript guard
  assert.ok(fused[1]); // TypeScript guard
  assert.ok(fused[2]); // TypeScript guard
});

test("fuseRagCandidates merges match_types for same chunk", () => {
  const lexical: RagCandidate[] = [
    {
      chunk_id: "1",
      article_path: "a/b",
      article_title: "Article A",
      heading_path: [],
      content: "Content A",
      score: 0.8,
      match_types: ["lexical"],
      updated_at: new Date(),
    },
  ];

  const vector: RagCandidate[] = [
    {
      chunk_id: "1",
      article_path: "a/b",
      article_title: "Article A",
      heading_path: [],
      content: "Content A",
      score: 0.9,
      match_types: ["vector"],
      updated_at: new Date(),
    },
  ];

  const fused = fuseRagCandidates([lexical, vector]);

  assert.equal(fused.length, 1);
  assert.ok(fused[0]); // TypeScript guard
  assert.ok(fused[0].match_types.includes("lexical"));
  assert.ok(fused[0].match_types.includes("vector"));
});

test("fuseRagCandidates handles empty lists", () => {
  const fused = fuseRagCandidates([[], []]);

  assert.equal(fused.length, 0);
});

test("fuseRagCandidates sorts by RRF score", () => {
  const list1: RagCandidate[] = [
    {
      chunk_id: "1",
      article_path: "a",
      article_title: "A",
      heading_path: [],
      content: "A",
      score: 0.5,
      match_types: ["lexical"],
      updated_at: new Date(),
    },
    {
      chunk_id: "2",
      article_path: "b",
      article_title: "B",
      heading_path: [],
      content: "B",
      score: 0.3,
      match_types: ["lexical"],
      updated_at: new Date(),
    },
  ];

  const list2: RagCandidate[] = [
    {
      chunk_id: "2",
      article_path: "b",
      article_title: "B",
      heading_path: [],
      content: "B",
      score: 0.8,
      match_types: ["vector"],
      updated_at: new Date(),
    },
    {
      chunk_id: "1",
      article_path: "a",
      article_title: "A",
      heading_path: [],
      content: "A",
      score: 0.7,
      match_types: ["vector"],
      updated_at: new Date(),
    },
  ];

  const fused = fuseRagCandidates([list1, list2]);

  assert.equal(fused.length, 2);
  assert.ok(fused[0]); // TypeScript guard
  assert.equal(fused[0].chunk_id, "2");
});
