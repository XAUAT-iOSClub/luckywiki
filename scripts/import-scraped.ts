// Import scraped articles into local database (skip agent reindex)
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { snapshotArticleRevision } from "../lib/articles/revisions";
import {
  importArticlesFromDirectory,
  parseImportCliArgs,
} from "../lib/articles/import";

async function main() {
  const options = parseImportCliArgs(process.argv.slice(2));

  console.log("Importing articles...");
  console.log(`  Directory: ${options.directory}`);
  console.log(`  Author:    ${options.authorEmail}`);
  console.log(`  Status:    ${options.status}`);
  console.log(`  Dry run:   ${options.dryRun}`);

  let importAuthorId: string | null = null;
  const summary = await importArticlesFromDirectory({
    ...options,
    repo: {
      async findUserByEmail(email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true },
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
      async createArticle(data) {
        await prisma.$transaction(async (tx) => {
          const article = await tx.article.create({ data });
          await snapshotArticleRevision(tx, article, data.authorId, {
            force: true,
          });
        });
      },
      async updateArticle(id, data) {
        if (!importAuthorId) {
          throw new Error("Import author could not be resolved.");
        }

        const authorId = importAuthorId;

        await prisma.$transaction(async (tx) => {
          const article = await tx.article.update({ where: { id }, data });
          await snapshotArticleRevision(tx, article, authorId);
        });
      },
    },
  });

  console.log("\nImport complete!");
  console.log(`  Created: ${summary.created}`);
  console.log(`  Updated: ${summary.updated}`);
  console.log(`  Skipped: ${summary.skipped}`);
  console.log(`  Failed:  ${summary.failed}`);
  console.log(`  Total:   ${summary.total}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
