import "dotenv/config";
import {
  importArticleImagesFromDirectory,
  parseArticleImageImportCliArgs,
} from "../lib/articles/image-import";

async function main() {
  const options = parseArticleImageImportCliArgs(process.argv.slice(2));
  const summary = await importArticleImagesFromDirectory({
    ...options,
  });

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
