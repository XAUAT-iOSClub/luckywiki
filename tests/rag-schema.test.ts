import assert from "node:assert";
import test from "node:test";
import { ragSearchSchema } from "../lib/rag/schema";

test("ragSearchSchema accepts valid minimal payload", () => {
  const parsed = ragSearchSchema.parse({
    query: "校园卡",
  });

  assert.equal(parsed.query, "校园卡");
  assert.equal(parsed.top_k, 6);
  assert.equal(parsed.mode, "auto");
  assert.equal(parsed.include_content, true);
  assert.equal(parsed.include_context, false);
});

test("ragSearchSchema accepts all fields", () => {
  const parsed = ragSearchSchema.parse({
    query: "校园卡怎么充值",
    top_k: 10,
    mode: "hybrid",
    include_content: false,
    include_context: true,
  });

  assert.equal(parsed.query, "校园卡怎么充值");
  assert.equal(parsed.top_k, 10);
  assert.equal(parsed.mode, "hybrid");
  assert.equal(parsed.include_content, false);
  assert.equal(parsed.include_context, true);
});

test("ragSearchSchema rejects empty query", () => {
  assert.throws(() => {
    ragSearchSchema.parse({
      query: "",
    });
  });
});

test("ragSearchSchema rejects query too long", () => {
  assert.throws(() => {
    ragSearchSchema.parse({
      query: "a".repeat(201),
    });
  });
});

test("ragSearchSchema rejects top_k too large", () => {
  assert.throws(() => {
    ragSearchSchema.parse({
      query: "test",
      top_k: 21,
    });
  });
});

test("ragSearchSchema rejects invalid mode", () => {
  assert.throws(() => {
    ragSearchSchema.parse({
      query: "test",
      mode: "invalid",
    });
  });
});

test("ragSearchSchema trims whitespace from query", () => {
  const parsed = ragSearchSchema.parse({
    query: "  校园卡  ",
  });

  assert.equal(parsed.query, "校园卡");
});
