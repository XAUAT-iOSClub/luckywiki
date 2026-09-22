// Scrape articles from baike.xauat.site and save as markdown files
import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SITE_URL = "https://baike.xauat.site";
const OUTPUT_DIR = join(process.cwd(), "articles-scraped");
const LANG = "zh"; // only scrape Chinese articles

async function fetchSitemap() {
  console.log("Fetching sitemap...");
  const resp = await fetch(`${SITE_URL}/sitemap.xml`);
  const xml = await resp.text();

  // Extract all zh wiki URLs
  const urlRegex = /<loc>(https:\/\/baike\.xauat\.site\/zh\/wiki\/[^<]+)<\/loc>/g;
  const urls = [];
  const seen = new Set();
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  console.log(`Found ${urls.length} unique Chinese articles in sitemap`);
  return urls;
}

function urlToPath(url) {
  // https://baike.xauat.site/zh/wiki/some/path -> some/path
  const prefix = `${SITE_URL}/${LANG}/wiki/`;
  return decodeURIComponent(url.slice(prefix.length));
}

async function fetchArticle(path) {
  // Encode each path segment separately to preserve slashes for [...path] route
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `${SITE_URL}/api/pages/${encodedPath}`;
  try {
    const resp = await fetch(apiUrl);
    if (resp.status === 404) {
      console.warn(`\n  404: ${path}`);
      return null;
    }
    if (!resp.ok) {
      console.warn(`\n  ${resp.status}: ${path}`);
      return null;
    }
    const json = await resp.json();
    return json.data;
  } catch (e) {
    console.warn(`\n  Error fetching ${path}: ${e}`);
    return null;
  }
}

function articleToMarkdown(article) {
  const { title, description, tags, markdown, editor, publishedAt } = article;
  const frontmatter = ["---"];
  frontmatter.push(`title: ${JSON.stringify(title)}`);
  if (description) frontmatter.push(`description: ${JSON.stringify(description)}`);
  if (tags && tags.length > 0) frontmatter.push(`tags: [${tags.map(t => JSON.stringify(t)).join(", ")}]`);
  if (editor) frontmatter.push(`editor: ${JSON.stringify(editor)}`);
  if (publishedAt) frontmatter.push(`date: ${publishedAt}`);
  frontmatter.push("published: true");
  frontmatter.push("---");
  frontmatter.push("");
  frontmatter.push(markdown || "");
  return frontmatter.join("\n");
}

function sanitizePath(path) {
  // Remove leading/trailing slashes, replace invalid chars
  return path.replace(/^\/+|\/+$/g, "").replace(/[<>:"|?*]/g, "_");
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const urls = await fetchSitemap();
  const paths = urls.map(urlToPath).filter(p => p && p !== "");
  console.log(`Unique article paths: ${paths.length}`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const safePath = sanitizePath(path);
    const filePath = join(OUTPUT_DIR, `${safePath}.md`);

    // Skip if already exists (resume support)
    if (existsSync(filePath)) {
      skipped++;
      process.stdout.write(`\r[${i + 1}/${paths.length}] Skipped: ${path.slice(0, 40).padEnd(40)}`);
      continue;
    }

    process.stdout.write(`\r[${i + 1}/${paths.length}] Fetching: ${path.slice(0, 40).padEnd(40)}`);

    const article = await fetchArticle(path);
    if (!article) {
      failed++;
      continue;
    }

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const mdContent = articleToMarkdown(article);
    writeFileSync(filePath, mdContent, "utf-8");
    success++;

    // Small delay to be nice to the server
    await new Promise(r => setTimeout(r, 80));
  }

  console.log(`\n\nDone!`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Output:  ${OUTPUT_DIR}`);
}

main().catch(console.error);
