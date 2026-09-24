import assert from "node:assert";
import test from "node:test";
import { buildExcerpt } from "../lib/rag/excerpt";

test("buildExcerpt returns full text if shorter than maxLength", () => {
  const content = "这是一个简短的文本";
  const excerpt = buildExcerpt(content, "文本", 100);

  assert.equal(excerpt, content);
});

test("buildExcerpt highlights query match", () => {
  const content =
    "校园卡可通过校园一卡通公众号、财务处自助机等方式进行充值。支持支付宝、微信等多种支付方式。";
  const excerpt = buildExcerpt(content, "充值", 80);

  assert.ok(excerpt.includes("充值"));
});

test("buildExcerpt adds ellipsis for long text", () => {
  const content = "a".repeat(300);
  const excerpt = buildExcerpt(content, "test", 100);

  assert.ok(excerpt.endsWith("..."));
  assert.ok(excerpt.length <= 103); // 100 + "..."
});

test("buildExcerpt removes markdown formatting", () => {
  const content = "# 标题\n\n这是**粗体**和*斜体*文本\n\n- 列表项";
  const excerpt = buildExcerpt(content, "文本", 100);

  assert.ok(!excerpt.includes("#"));
  assert.ok(!excerpt.includes("**"));
  assert.ok(!excerpt.includes("*"));
  assert.ok(!excerpt.includes("-"));
});

test("buildExcerpt removes code blocks", () => {
  const content = "文本前\n```js\nconst x = 1;\n```\n文本后";
  const excerpt = buildExcerpt(content, "文本", 100);

  assert.ok(!excerpt.includes("const"));
  assert.ok(!excerpt.includes("```"));
});

test("buildExcerpt normalizes whitespace", () => {
  const content = "这是   多个\n\n空格   的文本";
  const excerpt = buildExcerpt(content, "文本", 100);

  assert.ok(!excerpt.includes("  "));
  assert.ok(!excerpt.includes("\n"));
});

test("buildExcerpt returns empty string for empty content", () => {
  const excerpt = buildExcerpt("", "test", 100);

  assert.equal(excerpt, "");
});
