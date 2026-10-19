import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiffHunks,
  countDiffStats,
  diffArticleMarkdown,
  type DiffLine,
} from "@/lib/articles/revision-diff";

function summarize(lines: DiffLine[]) {
  return lines.map((line) => `${line.type}:${line.text}`);
}

function reconstruct(before: string, after: string) {
  const diff = diffArticleMarkdown(before, after);
  const beforeLines: string[] = [];
  const afterLines: string[] = [];

  for (const line of diff.lines) {
    if (line.type === "context") {
      beforeLines.push(line.text);
      afterLines.push(line.text);
    } else if (line.type === "remove") {
      beforeLines.push(line.text);
    } else {
      afterLines.push(line.text);
    }
  }

  return {
    beforeLines,
    afterLines,
    expectedBefore: normalizeLines(before),
    expectedAfter: normalizeLines(after),
  };
}

function normalizeLines(value: string) {
  if (value.length === 0) {
    return [];
  }

  const lines = value.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

test("identical markdown produces no hunks", () => {
  const diff = diffArticleMarkdown("# Title\n\nBody", "# Title\n\nBody");

  assert.equal(diff.lines.length, 3);
  assert.deepEqual(diff.hunks, []);
  assert.deepEqual(diff.stats, { additions: 0, deletions: 0, unchanged: 3 });
});

test("line replacements keep line numbers on both sides", () => {
  const diff = diffArticleMarkdown("a\nb\nc", "a\nB\nc");

  assert.deepEqual(summarize(diff.lines), [
    "context:a",
    "remove:b",
    "add:B",
    "context:c",
  ]);
  assert.deepEqual(diff.lines[1], {
    type: "remove",
    text: "b",
    oldLineNumber: 2,
    newLineNumber: null,
  });
  assert.deepEqual(diff.lines[2], {
    type: "add",
    text: "B",
    oldLineNumber: null,
    newLineNumber: 2,
  });
  assert.deepEqual(diff.stats, { additions: 1, deletions: 1, unchanged: 2 });
});

test("insertions and deletions are detected", () => {
  const inserted = diffArticleMarkdown("one\nthree", "one\ntwo\nthree");
  assert.deepEqual(summarize(inserted.lines), [
    "context:one",
    "add:two",
    "context:three",
  ]);

  const deleted = diffArticleMarkdown("one\ntwo\nthree", "one\nthree");
  assert.deepEqual(summarize(deleted.lines), [
    "context:one",
    "remove:two",
    "context:three",
  ]);
});

test("CRLF endings and trailing newlines do not create phantom changes", () => {
  const diff = diffArticleMarkdown("# Title\r\n\r\nBody\r\n", "# Title\n\nBody\n");

  assert.equal(diff.stats.additions, 0);
  assert.equal(diff.stats.deletions, 0);
  assert.deepEqual(diff.hunks, []);
});

test("empty content diffs against a full document", () => {
  const diff = diffArticleMarkdown("", "line 1\nline 2");

  assert.deepEqual(summarize(diff.lines), ["add:line 1", "add:line 2"]);
  assert.deepEqual(diff.stats, { additions: 2, deletions: 0, unchanged: 0 });
  assert.deepEqual(diff.hunks[0], {
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 2,
    lines: diff.lines,
  });
});

test("hunks collapse long unchanged stretches and keep context", () => {
  const before = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");
  const after = before.replace("line 15", "line 15 changed");
  const diff = diffArticleMarkdown(before, after, { contextLines: 2 });

  assert.equal(diff.hunks.length, 1);
  assert.equal(diff.hunks[0].oldStart, 13);
  assert.equal(diff.hunks[0].oldLines, 5);
  assert.equal(diff.hunks[0].newLines, 5);
  assert.deepEqual(
    summarize(diff.hunks[0].lines),
    [
      "context:line 13",
      "context:line 14",
      "remove:line 15",
      "add:line 15 changed",
      "context:line 16",
      "context:line 17",
    ],
  );
});

test("distant changes produce separate hunks", () => {
  const before = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n");
  const after = before
    .replace("line 2", "line 2 changed")
    .replace("line 38", "line 38 changed");
  const diff = diffArticleMarkdown(before, after, { contextLines: 1 });

  assert.equal(diff.hunks.length, 2);
  assert.equal(diff.hunks[0].oldStart, 1);
  assert.equal(diff.hunks[1].oldStart, 37);
});

test("diff stats count every edited line", () => {
  const lines: DiffLine[] = [
    { type: "context", text: "a", oldLineNumber: 1, newLineNumber: 1 },
    { type: "remove", text: "b", oldLineNumber: 2, newLineNumber: null },
    { type: "add", text: "B", oldLineNumber: null, newLineNumber: 2 },
    { type: "add", text: "C", oldLineNumber: null, newLineNumber: 3 },
  ];

  assert.deepEqual(countDiffStats(lines), {
    additions: 2,
    deletions: 1,
    unchanged: 1,
  });
  assert.equal(buildDiffHunks(lines).length, 1);
});

test("large heavily edited documents fall back without losing content", () => {
  const before = Array.from(
    { length: 2_000 },
    (_, index) => `before line ${index + 1}`,
  ).join("\n");
  const after = Array.from(
    { length: 2_000 },
    (_, index) => `after line ${index + 1}`,
  ).join("\n");
  const diff = diffArticleMarkdown(before, after);

  assert.equal(diff.stats.additions, 2_000);
  assert.equal(diff.stats.deletions, 2_000);
  assert.equal(diff.stats.unchanged, 0);
  assert.equal(diff.lines.length, 4_000);
});

test("diff output reconstructs both documents for random line sequences", () => {
  let seed = 42;

  function random() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  const alphabet = ["a", "b", "c", "d", ""];

  for (let iteration = 0; iteration < 500; iteration += 1) {
    const beforeLines = Array.from(
      { length: Math.floor(random() * 9) },
      () => alphabet[Math.floor(random() * alphabet.length)],
    );
    const afterLines = Array.from(
      { length: Math.floor(random() * 9) },
      () => alphabet[Math.floor(random() * alphabet.length)],
    );
    const before = beforeLines.join("\n");
    const after = afterLines.join("\n");
    const {
      beforeLines: reconstructedBefore,
      afterLines: reconstructedAfter,
      expectedBefore,
      expectedAfter,
    } = reconstruct(before, after);

    assert.deepEqual(reconstructedBefore, expectedBefore);
    assert.deepEqual(reconstructedAfter, expectedAfter);
  }
});
