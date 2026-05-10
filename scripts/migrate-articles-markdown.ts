import { migrateArticlesDirectory } from "../lib/articles/markdown-migrate";

async function main() {
  const directory = process.argv[2] ?? "articles";
  const summary = await migrateArticlesDirectory(directory, console);

  console.info(
    [
      `markdown=${summary.markdownFiles}`,
      `html=${summary.htmlFiles}`,
      `written=${summary.writtenFiles}`,
      `deletedHtml=${summary.deletedHtmlFiles}`,
      `warnings=${summary.warnings}`,
    ].join(" "),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
