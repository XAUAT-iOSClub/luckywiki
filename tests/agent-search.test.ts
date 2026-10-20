import test from "node:test";
import assert from "node:assert/strict";
import { buildLexicalQuery } from "@/lib/agent/search";

test("lexical fallback keeps key Chinese terms and drops question words", () => {
  const query = buildLexicalQuery("校园卡怎么补办？");

  assert.match(query, /校园卡/);
  assert.match(query, /补办/);
  assert.doesNotMatch(query, /怎么/);
});

test("lexical fallback joins adjacent single characters into words", () => {
  assert.match(buildLexicalQuery("学生证"), /学生证/);
  assert.match(buildLexicalQuery("转专业"), /转专业/);
  assert.match(buildLexicalQuery("图书馆数据库怎么访问？"), /图书馆/);
  assert.match(buildLexicalQuery("图书馆数据库怎么访问？"), /数据库/);
});

test("lexical fallback supports English questions", () => {
  const query = buildLexicalQuery("How do I replace a campus card?");

  assert.match(query, /replace/);
  assert.match(query, /campus/);
  assert.match(query, /card/);
  assert.doesNotMatch(query, /how/i);
});

test("lexical fallback ignores empty or punctuation-only input", () => {
  assert.equal(buildLexicalQuery(""), "");
  assert.equal(buildLexicalQuery("？？？"), "");
});
