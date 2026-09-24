// Import scraped articles into local database (skip agent reindex)
import "dotenv/config";
import { prisma } from "../lib/prisma";
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

  const summary = await importArticlesFromDirectory({
    ...options,
    repo: {
      async findUserByEmail(email) {
        return prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true },
        });
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
        await prisma.article.create({ data });
      },
      async updateArticle(id, data) {
        await prisma.article.update({ where: { id }, data });
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
