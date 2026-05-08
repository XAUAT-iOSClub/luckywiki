import test from "node:test";
import assert from "node:assert/strict";
import { ArticleStatus } from "@/generated/prisma/enums";
import { syncArticleEmbeddingsWithRepository } from "@/lib/agent-index-core";

test("syncArticleEmbeddingsWithRepository replaces article chunks after markdown changes", async () => {
  const records = new Map<string, { content: string }[]>();

  const repository = {
    async deleteArticleChunks(articleId: string) {
      records.delete(articleId);
    },
    async replaceArticleChunks(
      articleId: string,
      nextRecords: Array<{ content: string }>,
    ) {
      records.set(articleId, nextRecords);
    },
  };

  const embed = async (texts: string[]) => texts.map((_, index) => [index + 1, 0, 0]);

  await syncArticleEmbeddingsWithRepository({
    article: {
      id: "article-1",
      title: "校园卡",
      path: "生活/校园卡",
      markdown: "# 补办\n\n校园卡丢失后可以补办。",
      status: ArticleStatus.PUBLISHED,
    },
    repository,
    embed,
    enabled: true,
  });

  assert.match(records.get("article-1")?.[0]?.content ?? "", /补办/);

  await syncArticleEmbeddingsWithRepository({
    article: {
      id: "article-1",
      title: "校园卡",
      path: "生活/校园卡",
      markdown: "# 充值\n\n校园卡可以线上充值。",
      status: ArticleStatus.PUBLISHED,
    },
    repository,
    embed,
    enabled: true,
  });

  assert.match(records.get("article-1")?.[0]?.content ?? "", /线上充值/);
  assert.doesNotMatch(records.get("article-1")?.[0]?.content ?? "", /丢失/);
});

test("syncArticleEmbeddingsWithRepository deletes chunks for drafts", async () => {
  let deletedId = "";

  await syncArticleEmbeddingsWithRepository({
    article: {
      id: "article-2",
      title: "图书馆",
      path: "学习/图书馆",
      markdown: "内容",
      status: ArticleStatus.DRAFT,
    },
    repository: {
      async deleteArticleChunks(articleId) {
        deletedId = articleId;
      },
      async replaceArticleChunks() {
        throw new Error("should not replace draft chunks");
      },
    },
    enabled: true,
  });

  assert.equal(deletedId, "article-2");
});
