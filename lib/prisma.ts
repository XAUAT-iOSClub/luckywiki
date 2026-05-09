import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const CLOSED_CONNECTION_PATTERNS = [
  "server has closed the connection",
  "connection terminated unexpectedly",
  "can't reach database server",
  "connection was closed",
];

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

function includesClosedConnectionMessage(value: string) {
  const normalized = value.toLowerCase();

  return CLOSED_CONNECTION_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function errorContainsClosedConnectionMessage(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "string") {
    return includesClosedConnectionMessage(error);
  }

  if (error instanceof Error) {
    if (includesClosedConnectionMessage(error.message)) {
      return true;
    }

    return errorContainsClosedConnectionMessage(error.cause);
  }

  if (typeof error === "object") {
    const values = Object.values(error);
    return values.some((value) => errorContainsClosedConnectionMessage(value));
  }

  return false;
}

export function shouldReconnectPrisma(operation: string, error: unknown) {
  return READ_OPERATIONS.has(operation) && errorContainsClosedConnectionMessage(error);
}

function createPrismaClient() {
  const client = new PrismaClient({ adapter });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, operation, query }) {
          try {
            return await query(args);
          } catch (error) {
            if (!shouldReconnectPrisma(operation, error)) {
              throw error;
            }

            await client.$disconnect().catch(() => undefined);
            await client.$connect();

            return query(args);
          }
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
