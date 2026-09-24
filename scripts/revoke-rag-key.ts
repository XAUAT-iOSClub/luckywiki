import { prisma } from "../lib/prisma";
import { hashRagKey } from "../lib/rag/auth";

async function main() {
  const keyToRevoke = process.argv[2];

  if (!keyToRevoke) {
    console.error("Usage: pnpm tsx scripts/revoke-rag-key.ts <key>");
    process.exit(1);
  }

  const result = await prisma.ragApiKey.updateMany({
    where: {
      keyHash: hashRagKey(keyToRevoke),
      status: "ACTIVE",
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  if (result.count === 0) {
    console.log("No active key found with the provided value.");
  } else {
    console.log("RAG API Key revoked successfully.");
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
