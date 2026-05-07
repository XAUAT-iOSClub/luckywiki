import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  importArticlesFromDirectory,
  parseImportCliArgs,
  type CreateImportArticleInput,
  type UpdateImportArticleInput,
} from "../lib/article-import";

async function main() {
  const options = parseImportCliArgs(process.argv.slice(2));
  const summary = await importArticlesFromDirectory({
    ...options,
    repo: {
      async findUserByEmail(email) {
        return prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
          },
        });
      },
      async findArticleByPath(path) {
        return prisma.article.findUnique({
          where: { path },
          select: {
            id: true,
            title: true,
            markdown: true,
            status: true,
            publishedAt: true,
          },
        });
      },
      async createArticle(data: CreateImportArticleInput) {
        await prisma.article.create({ data });
      },
      async updateArticle(id: string, data: UpdateImportArticleInput) {
        await prisma.article.update({
          where: { id },
          data,
        });
      },
    },
  });

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
