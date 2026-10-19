import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Single source of truth for both the Prisma CLI and the app runtime.
    url: process.env.DATABASE_URL ?? "",
  },
});
