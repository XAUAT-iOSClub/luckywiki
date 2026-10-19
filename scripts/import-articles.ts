import "dotenv/config";
import { reindexAllPublishedArticleEmbeddings } from "../lib/agent/index";
import { prisma } from "../lib/prisma";
import { snapshotArticleRevision } from "../lib/articles/revisions";
import {
  importArticlesFromDirectory,
  parseImportCliArgs,
  type CreateImportArticleInput,
  type UpdateImportArticleInput,
} from "../lib/articles/import";

async function main() {
  const options = parseImportCliArgs(process.argv.slice(2));
  let importAuthorId: string | null = null;
  const summary = await importArticlesFromDirectory({
    ...options,
    repo: {
      async findUserByEmail(email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
          },
        });

        importAuthorId = user?.id ?? null;

        return user;
      },
      async findArticleByPath(path) {
        return prisma.article.findUnique({
          where: { path },
          select: {
            id: true,
            title: true,
            description: true,
            tags: true,
            editor: true,
            markdown: true,
            status: true,
            publishedAt: true,
          },
        });
      },
      async createArticle(data: CreateImportArticleInput) {
        await prisma.$transaction(async (tx) => {
          const article = await tx.article.create({ data });
          await snapshotArticleRevision(tx, article, data.authorId, {
            force: true,
          });
        });
      },
      async updateArticle(id: string, data: UpdateImportArticleInput) {
        if (!importAuthorId) {
          throw new Error("Import author could not be resolved.");
        }

        const authorId = importAuthorId;

        await prisma.$transaction(async (tx) => {
          const article = await tx.article.update({
            where: { id },
            data,
          });
          await snapshotArticleRevision(tx, article, authorId);
        });
      },
    },
  });

  if (summary.failed > 0) {
    process.exitCode = 1;
  }

  await reindexAllPublishedArticleEmbeddings();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
