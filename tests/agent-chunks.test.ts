import test from "node:test";
import assert from "node:assert/strict";
import { ArticleStatus } from "@/generated/prisma/enums";
import {
  buildArticleChunks,
  cosineSimilarity,
  rankChunksBySimilarity,
} from "@/lib/agent-chunks";

test("buildArticleChunks splits markdown by heading and preserves readable content", () => {
  const chunks = buildArticleChunks({
    id: "article-1",
    title: "校园卡",
    path: "生活/校园卡",
    markdown: `# 补办\n\n校园卡丢失后可以在服务大厅补办。\n\n# 充值\n\n可以在自助机或线上充值。`,
    status: ArticleStatus.PUBLISHED,
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.heading, "补办");
  assert.match(chunks[0]?.content ?? "", /服务大厅补办/);
  assert.equal(chunks[1]?.heading, "充值");
});

test("rankChunksBySimilarity orders chunks by cosine similarity", () => {
  const ranked = rankChunksBySimilarity(
    [
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0.9, 0.1, 0] },
      { id: "c", embedding: [0, 1, 0] },
    ],
    [1, 0, 0],
  );

  assert.equal(ranked[0]?.id, "a");
  assert.equal(ranked[1]?.id, "b");
  assert.equal(ranked[2]?.id, "c");
  assert.ok(cosineSimilarity([1, 0], [1, 0]) > cosineSimilarity([1, 0], [0, 1]));
});
