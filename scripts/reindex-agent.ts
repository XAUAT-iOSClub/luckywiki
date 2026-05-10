import "dotenv/config";
import { prisma } from "../lib/prisma";
import { reindexAllPublishedArticleEmbeddings } from "../lib/agent/index";

async function main() {
  const results = await reindexAllPublishedArticleEmbeddings();
  const totalChunks = results.reduce((sum, entry) => sum + entry.chunkCount, 0);
  console.info(`Reindexed ${results.length} published article(s) into ${totalChunks} agent chunk(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
