import "dotenv/config";
import {
  cleanupOrphanMediaAssets,
  cleanupUntrackedStorageObjects,
} from "../lib/media/cleanup";
import { prisma } from "../lib/prisma";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let graceDays: number | undefined;
  let limit: number | undefined;
  let scanStorage = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--scan-storage") {
      scanStorage = true;
      continue;
    }

    if (arg.startsWith("--grace-days=")) {
      graceDays = parsePositiveInteger(arg.slice("--grace-days=".length), arg);
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = parsePositiveInteger(arg.slice("--limit=".length), arg);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { dryRun, graceDays, limit, scanStorage };
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }

  return Math.floor(parsed);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.scanStorage) {
    const result = await cleanupUntrackedStorageObjects({
      dryRun: options.dryRun,
      graceDays: options.graceDays,
      limit: options.limit,
    });
    console.info(
      `Storage scan: scanned=${result.scanned} untracked=${result.matched} deleted=${result.deleted} failed=${result.failed} freedBytes=${result.freedBytes}${result.dryRun ? " (dry run)" : ""}`,
    );

    if (result.dryRun && result.untracked.length > 0) {
      for (const object of result.untracked) {
        console.info(`  ${object.key} (${object.size} bytes)`);
      }
    }

    if (result.failed > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const result = await cleanupOrphanMediaAssets({
    dryRun: options.dryRun,
    graceDays: options.graceDays,
    limit: options.limit,
  });
  console.info(
    `Media cleanup: scanned=${result.scanned} deleted=${result.deleted} failed=${result.failed} skipped=${result.skipped} freedBytes=${result.freedBytes} graceDays=${result.graceDays}${result.dryRun ? " (dry run)" : ""}`,
  );

  for (const error of result.errors) {
    console.error(`  ${error.id} ${error.storageKey}: ${error.message}`);
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
