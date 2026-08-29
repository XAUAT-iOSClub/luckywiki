import "dotenv/config";
import { defineConfig } from "prisma/config";

function connectionUrl() {
  const value =
    process.env.PARADEDB_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.PRISMA_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    "";

  if (process.env.PARADEDB_SSL_MODE !== "disable") {
    return value;
  }

  try {
    const url = new URL(value);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("ssl");
    return url.toString();
  } catch {
    return value;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: connectionUrl(),
  },
});
