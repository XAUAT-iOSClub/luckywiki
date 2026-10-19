import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { snapshotArticleRevision } from "@/lib/articles/revisions";

type FakeRevision = {
  id: string;
  articleId: string;
  title: string;
  markdown: string;
  authorId: string;
};

function createTransaction(latest: Pick<FakeRevision, "title" | "markdown"> | null) {
  const created: FakeRevision[] = [];
  const tx = {
    articleRevision: {
      async findFirst() {
        return latest;
      },
      async create({ data }: { data: Omit<FakeRevision, "id"> }) {
        const revision = { ...data, id: `revision-${created.length + 1}` };
        created.push(revision);
        return revision;
      },
    },
  };

  return {
    created,
    tx: tx as unknown as Prisma.TransactionClient,
  };
}

const article = {
  id: "article-1",
  title: "Campus card",
  markdown: "# Reissue",
};

test("snapshots the saved article content", async () => {
  const { created, tx } = createTransaction(null);
  const revision = await snapshotArticleRevision(tx, article, "author-1");

  assert.ok(revision);
  assert.deepEqual(created, [
    {
      id: "revision-1",
      articleId: "article-1",
      title: "Campus card",
      markdown: "# Reissue",
      authorId: "author-1",
    },
  ]);
});

test("skips duplicate snapshots when only metadata changed", async () => {
  const { created, tx } = createTransaction({
    title: article.title,
    markdown: article.markdown,
  });
  const revision = await snapshotArticleRevision(tx, article, "author-1");

  assert.equal(revision, null);
  assert.equal(created.length, 0);
});

test("captures a new snapshot when the body changes", async () => {
  const { created, tx } = createTransaction({
    title: article.title,
    markdown: "# Old body",
  });
  const revision = await snapshotArticleRevision(tx, article, "author-1");

  assert.ok(revision);
  assert.equal(created[0]?.markdown, "# Reissue");
});

test("force creates the initial revision even when content matches", async () => {
  const { created, tx } = createTransaction({
    title: article.title,
    markdown: article.markdown,
  });
  const revision = await snapshotArticleRevision(tx, article, "author-1", {
    force: true,
  });

  assert.ok(revision);
  assert.equal(created.length, 1);
});
