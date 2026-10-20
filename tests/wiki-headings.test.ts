import test from "node:test";
import assert from "node:assert/strict";
import { hasHtmlHeadings, hasMarkdownHeadings } from "@/lib/wiki/headings";

test("reports no headings for ordinary paragraphs", () => {
  assert.equal(hasMarkdownHeadings(""), false);
  assert.equal(hasMarkdownHeadings("   \n\t\n"), false);
  assert.equal(
    hasMarkdownHeadings("Just a paragraph.\n\nAnother paragraph."),
    false,
  );
});

test("detects ATX headings", () => {
  assert.equal(hasMarkdownHeadings("# Title"), true);
  assert.equal(hasMarkdownHeadings("Lead in.\n\n### Deep heading\n\nBody."), true);
});

test("detects setext headings", () => {
  assert.equal(hasMarkdownHeadings("Title\n====="), true);
  assert.equal(hasMarkdownHeadings("Title\n-----"), true);
});

test("ignores hash lines inside fenced code blocks", () => {
  assert.equal(
    hasMarkdownHeadings("```bash\n# not a heading\n```"),
    false,
  );
  assert.equal(
    hasMarkdownHeadings("~~~md\n## still not a heading\n~~~"),
    false,
  );
});

test("ignores headings inside inline code and raw html", () => {
  assert.equal(hasMarkdownHeadings("Use `# heading` in a shell."), false);
  assert.equal(hasMarkdownHeadings("<h2>raw html</h2>"), false);
});

test("detects html headings only when they have an id", () => {
  assert.equal(hasHtmlHeadings('<h2 id="intro">Intro</h2>'), true);
  assert.equal(hasHtmlHeadings("<h2 id='intro'>Intro</h2>"), true);
  assert.equal(hasHtmlHeadings("<h3 id=intro>Intro</h3>"), true);
  assert.equal(hasHtmlHeadings("<h2>Intro</h2>"), false);
  assert.equal(hasHtmlHeadings("<p>No headings here.</p>"), false);
});
