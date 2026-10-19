export type DiffLineType = "context" | "add" | "remove";

export type DiffLine = {
  type: DiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type DiffStats = {
  additions: number;
  deletions: number;
  unchanged: number;
};

export type ArticleMarkdownDiff = {
  lines: DiffLine[];
  hunks: DiffHunk[];
  stats: DiffStats;
};

type SequenceEdit =
  | { type: "context"; beforeIndex: number; afterIndex: number }
  | { type: "remove"; beforeIndex: number }
  | { type: "add"; afterIndex: number };

// Myers is O((N + M) * D) where D is the number of edited lines. These guards
// keep worst-case documents (thousands of completely different lines) from
// exhausting memory or blocking the request; they fall back to a coarse
// replace block instead.
const MAX_MYERS_CELLS = 16_000_000;
const MAX_MYERS_TRACE_CELLS = 8_000_000;
const DEFAULT_CONTEXT_LINES = 3;

export function diffArticleMarkdown(
  before: string,
  after: string,
  options?: { contextLines?: number },
): ArticleMarkdownDiff {
  const lines = diffLines(splitLines(before), splitLines(after));
  const contextLines = options?.contextLines ?? DEFAULT_CONTEXT_LINES;

  return {
    lines,
    hunks: buildDiffHunks(lines, contextLines),
    stats: countDiffStats(lines),
  };
}

export function buildDiffHunks(
  lines: DiffLine[],
  contextLines = DEFAULT_CONTEXT_LINES,
): DiffHunk[] {
  const changedIndexes: number[] = [];

  lines.forEach((line, index) => {
    if (line.type !== "context") {
      changedIndexes.push(index);
    }
  });

  if (changedIndexes.length === 0) {
    return [];
  }

  const ranges: Array<[number, number]> = [];
  let rangeStart = Math.max(0, changedIndexes[0] - contextLines);
  let rangeEnd = Math.min(lines.length - 1, changedIndexes[0] + contextLines);

  for (let index = 1; index < changedIndexes.length; index += 1) {
    const nextStart = Math.max(0, changedIndexes[index] - contextLines);
    const nextEnd = Math.min(lines.length - 1, changedIndexes[index] + contextLines);

    if (nextStart <= rangeEnd + 1) {
      rangeEnd = Math.max(rangeEnd, nextEnd);
      continue;
    }

    ranges.push([rangeStart, rangeEnd]);
    rangeStart = nextStart;
    rangeEnd = nextEnd;
  }

  ranges.push([rangeStart, rangeEnd]);

  return ranges.map(([start, end]) => {
    const hunkLines = lines.slice(start, end + 1);
    const oldNumbers = hunkLines
      .map((line) => line.oldLineNumber)
      .filter((value): value is number => value !== null);
    const newNumbers = hunkLines
      .map((line) => line.newLineNumber)
      .filter((value): value is number => value !== null);

    return {
      oldStart: oldNumbers[0] ?? findPreviousLineNumber(lines, start, "oldLineNumber"),
      oldLines: oldNumbers.length,
      newStart: newNumbers[0] ?? findPreviousLineNumber(lines, start, "newLineNumber"),
      newLines: newNumbers.length,
      lines: hunkLines,
    };
  });
}

export function countDiffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (stats, line) => {
      if (line.type === "add") {
        stats.additions += 1;
      } else if (line.type === "remove") {
        stats.deletions += 1;
      } else {
        stats.unchanged += 1;
      }

      return stats;
    },
    { additions: 0, deletions: 0, unchanged: 0 },
  );
}

function findPreviousLineNumber(
  lines: DiffLine[],
  index: number,
  key: "oldLineNumber" | "newLineNumber",
) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = lines[cursor][key];

    if (value !== null) {
      return value + 1;
    }
  }

  return 1;
}

function diffLines(before: string[], after: string[]): DiffLine[] {
  let prefixLength = 0;

  while (
    prefixLength < before.length &&
    prefixLength < after.length &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const beforeMiddle = before.slice(prefixLength, before.length - suffixLength);
  const afterMiddle = after.slice(prefixLength, after.length - suffixLength);
  const middleEdits = diffSequence(beforeMiddle, afterMiddle);
  const result: DiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;

  for (let index = 0; index < prefixLength; index += 1) {
    result.push({
      type: "context",
      text: before[index],
      oldLineNumber: oldLineNumber,
      newLineNumber: newLineNumber,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  for (const edit of middleEdits) {
    if (edit.type === "context") {
      result.push({
        type: "context",
        text: beforeMiddle[edit.beforeIndex],
        oldLineNumber,
        newLineNumber,
      });
      oldLineNumber += 1;
      newLineNumber += 1;
      continue;
    }

    if (edit.type === "remove") {
      result.push({
        type: "remove",
        text: beforeMiddle[edit.beforeIndex],
        oldLineNumber,
        newLineNumber: null,
      });
      oldLineNumber += 1;
      continue;
    }

    result.push({
      type: "add",
      text: afterMiddle[edit.afterIndex],
      oldLineNumber: null,
      newLineNumber,
    });
    newLineNumber += 1;
  }

  for (let index = before.length - suffixLength; index < before.length; index += 1) {
    result.push({
      type: "context",
      text: before[index],
      oldLineNumber,
      newLineNumber,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  return result;
}

function diffSequence(before: string[], after: string[]): SequenceEdit[] {
  if (before.length === 0) {
    return after.map((_, afterIndex) => ({ type: "add", afterIndex }));
  }

  if (after.length === 0) {
    return before.map((_, beforeIndex) => ({ type: "remove", beforeIndex }));
  }

  if (before.length * after.length > MAX_MYERS_CELLS) {
    return coarseDiff(before, after);
  }

  return myersDiff(before, after) ?? coarseDiff(before, after);
}

function coarseDiff(before: string[], after: string[]): SequenceEdit[] {
  return [
    ...before.map((_, beforeIndex) => ({ type: "remove" as const, beforeIndex })),
    ...after.map((_, afterIndex) => ({ type: "add" as const, afterIndex })),
  ];
}

function myersDiff(before: string[], after: string[]): SequenceEdit[] | null {
  const beforeLength = before.length;
  const afterLength = after.length;
  const maxDistance = beforeLength + afterLength;
  const vectorSize = 2 * maxDistance + 2;
  const offset = maxDistance;
  const vector = new Int32Array(vectorSize);
  const trace: Int32Array[] = [];
  // A full trace costs distance * vectorSize cells. Cap the distance so a
  // pathological diff cannot allocate unbounded memory.
  const distanceLimit = Math.min(
    maxDistance,
    Math.max(1, Math.floor(MAX_MYERS_TRACE_CELLS / vectorSize)),
  );
  let finalDistance = 0;
  let found = false;

  search: for (let distance = 0; distance <= distanceLimit; distance += 1) {
    trace.push(vector.slice());

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x: number;

      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          vector[offset + diagonal - 1] < vector[offset + diagonal + 1])
      ) {
        x = vector[offset + diagonal + 1];
      } else {
        x = vector[offset + diagonal - 1] + 1;
      }

      let y = x - diagonal;

      while (x < beforeLength && y < afterLength && before[x] === after[y]) {
        x += 1;
        y += 1;
      }

      vector[offset + diagonal] = x;

      if (x >= beforeLength && y >= afterLength) {
        finalDistance = distance;
        found = true;
        break search;
      }
    }
  }

  if (!found) {
    return null;
  }

  let x = beforeLength;
  let y = afterLength;
  const edits: SequenceEdit[] = [];

  for (let distance = finalDistance; distance > 0; distance -= 1) {
    const previousVector = trace[distance];
    const diagonal = x - y;
    let previousDiagonal: number;

    if (
      diagonal === -distance ||
      (diagonal !== distance &&
        previousVector[offset + diagonal - 1] <
          previousVector[offset + diagonal + 1])
    ) {
      previousDiagonal = diagonal + 1;
    } else {
      previousDiagonal = diagonal - 1;
    }

    const previousX = previousVector[offset + previousDiagonal];
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      edits.push({ type: "context", beforeIndex: x - 1, afterIndex: y - 1 });
      x -= 1;
      y -= 1;
    }

    if (x === previousX) {
      edits.push({ type: "add", afterIndex: y - 1 });
      y -= 1;
    } else {
      edits.push({ type: "remove", beforeIndex: x - 1 });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    edits.push({ type: "context", beforeIndex: x - 1, afterIndex: y - 1 });
    x -= 1;
    y -= 1;
  }

  return edits.reverse();
}

function splitLines(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n");

  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}
