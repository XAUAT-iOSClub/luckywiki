import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashRagKey } from "../lib/rag/auth";

async function main() {
  const name = process.argv[2] ?? "flutter-app";
  const hourlyLimit = process.argv[3] ? Number(process.argv[3]) : null;

  const key = `rag_${randomBytes(24).toString("hex")}`;

  await prisma.ragApiKey.create({
    data: {
      name,
      keyHash: hashRagKey(key),
      keyPrefix: key.slice(0, 12),
      status: "ACTIVE",
      hourlyLimit,
    },
  });

  console.log("RAG API Key created.");
  console.log("Name:", name);
  console.log("Key:", key);
  console.log("This key is shown only once.");
}

main()
  .finally(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
