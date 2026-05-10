import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

const INTERNAL_LINK_REGEX = /(\]\(\/)(?!wiki\/)([^)]*(?:\([^)]*\)[^)]*)*\))/g;

function transformMarkdownLinks(content: string): { transformed: string; count: number } {
  let count = 0;
  const transformed = content.replace(INTERNAL_LINK_REGEX, (...args) => {
    count += 1;
    return `${args[1]}wiki/${args[2]}`;
  });
  return { transformed, count };
}

type TransformResult = {
  filePath: string;
  changed: boolean;
  matchCount: number;
};

type TransformSummary = {
  filesScanned: number;
  filesChanged: number;
  totalMatches: number;
  results: TransformResult[];
};

async function transformFile(filePath: string): Promise<TransformResult> {
  const raw = await readFile(filePath, "utf-8");
  const { transformed, count } = transformMarkdownLinks(raw);
  const changed = count > 0;
  return { filePath, changed, matchCount: count };
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...(await walkDir(full)));
    } else if (st.isFile() && entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

async function transformDirectory(
  directory: string,
  dryRun: boolean,
): Promise<TransformSummary> {
  const absDir = resolve(directory);
  const files = await walkDir(absDir);

  const results: TransformResult[] = [];
  for (const filePath of files) {
    const result = await transformFile(filePath);
    if (result.changed && !dryRun) {
      const raw = await readFile(filePath, "utf-8");
      const { transformed } = transformMarkdownLinks(raw);
      await writeFile(filePath, transformed, "utf-8");
    }
    results.push(result);
  }

  const changedResults = results.filter((r) => r.changed);
  return {
    filesScanned: results.length,
    filesChanged: changedResults.length,
    totalMatches: changedResults.reduce((sum, r) => sum + r.matchCount, 0),
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const directory = args.find((a) => a !== "--dry-run") ?? "articles";

  console.info(`Processing .md files in "${directory}"${dryRun ? " (dry-run)" : ""}...\n`);

  const summary = await transformDirectory(directory, dryRun);

  for (const r of summary.results) {
    if (r.changed) {
      console.info(`  ${dryRun ? "[dry-run] " : ""}${r.filePath} → ${r.matchCount} links`);
    }
  }

  console.info(
    [
      `\nScanned: ${summary.filesScanned} .md files`,
      `Changed: ${summary.filesChanged} files`,
      `Total links transformed: ${summary.totalMatches}`,
      dryRun ? "(no files written)" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
