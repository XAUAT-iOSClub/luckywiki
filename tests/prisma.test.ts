import test from "node:test";
import assert from "node:assert/strict";

async function loadShouldReconnectPrisma() {
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/luckywiki_test";

  const mod = await import("@/lib/prisma");
  return mod.shouldReconnectPrisma;
}

test("reconnects closed-connection read queries", async () => {
  const shouldReconnectPrisma = await loadShouldReconnectPrisma();
  const error = new Error("Server has closed the connection.");

  assert.equal(shouldReconnectPrisma("findFirst", error), true);
  assert.equal(shouldReconnectPrisma("findMany", error), true);
});

test("does not retry write queries after a closed connection error", async () => {
  const shouldReconnectPrisma = await loadShouldReconnectPrisma();
  const error = new Error("Server has closed the connection.");

  assert.equal(shouldReconnectPrisma("create", error), false);
  assert.equal(shouldReconnectPrisma("update", error), false);
});

test("detects nested Prisma causes", async () => {
  const shouldReconnectPrisma = await loadShouldReconnectPrisma();
  const error = new Error("Query failed", {
    cause: {
      message: "Connection terminated unexpectedly",
    },
  });

  assert.equal(shouldReconnectPrisma("findUnique", error), true);
});

test("ignores unrelated database errors", async () => {
  const shouldReconnectPrisma = await loadShouldReconnectPrisma();
  const error = new Error("Unique constraint failed on the fields: (`email`)");

  assert.equal(shouldReconnectPrisma("findFirst", error), false);
});
