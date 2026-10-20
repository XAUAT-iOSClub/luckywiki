import "dotenv/config";
import {
  importExistingMediaFromArticles,
  refreshMissingMediaMetadata,
  resyncAllArticleMediaReferences,
} from "../lib/media/import";
import { prisma } from "../lib/prisma";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let importExisting = false;
  let refreshMetadata = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--import-existing") {
      importExisting = true;
      continue;
    }

    if (arg === "--refresh-metadata") {
      refreshMetadata = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { dryRun, importExisting, refreshMetadata };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.refreshMetadata) {
    const summary = await refreshMissingMediaMetadata({ logger: console });
    console.info(
      `Media metadata summary: scanned=${summary.scanned} updated=${summary.updated} failed=${summary.failed}`,
    );
    return;
  }

  if (options.importExisting) {
    const summary = await importExistingMediaFromArticles({
      dryRun: options.dryRun,
      logger: console,
    });
    console.info(
      `Media import summary: articles=${summary.articles} urls=${summary.urls} imported=${summary.imported} skipped=${summary.skipped} linked=${summary.linked}`,
    );
  } else {
    const summary = await resyncAllArticleMediaReferences({
      dryRun: options.dryRun,
      logger: console,
    });
    console.info(
      `Media reference summary: articles=${summary.articles} linked=${summary.linked} removed=${summary.removed}${options.dryRun ? " (dry run)" : ""}`,
    );
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
