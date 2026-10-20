export type ArticlePathMove = {
  from: string;
  to: string;
};

export type ArticlePathMovePlan =
  | { status: "ok"; moves: ArticlePathMove[] }
  | { status: "same" }
  | { status: "invalid" }
  | { status: "descendant" }
  | { status: "conflict"; path: string };

/**
 * Builds the path updates for moving an article (and, when it has nested
 * pages, its whole subtree) to a new location.
 *
 * `existingPaths` must contain every article path that could collide with the
 * destination (the source subtree plus the destination subtree is enough).
 */
export function planArticlePathMove(
  existingPaths: string[],
  currentPath: string,
  nextPath: string,
): ArticlePathMovePlan {
  if (!nextPath) {
    return { status: "invalid" };
  }

  if (currentPath === nextPath) {
    return { status: "same" };
  }

  if (nextPath.startsWith(`${currentPath}/`)) {
    return { status: "descendant" };
  }

  const affectedPaths = existingPaths.filter(
    (path) => path === currentPath || path.startsWith(`${currentPath}/`),
  );

  if (!affectedPaths.includes(currentPath)) {
    return { status: "invalid" };
  }

  const existingPathSet = new Set(existingPaths);
  const affectedPathSet = new Set(affectedPaths);
  const targetPathSet = new Set<string>();
  const moves = affectedPaths.map((path) => ({
    from: path,
    to:
      path === currentPath
        ? nextPath
        : `${nextPath}${path.slice(currentPath.length)}`,
  }));

  for (const move of moves) {
    if (targetPathSet.has(move.to)) {
      return { status: "conflict", path: move.to };
    }

    targetPathSet.add(move.to);

    if (existingPathSet.has(move.to) && !affectedPathSet.has(move.to)) {
      return { status: "conflict", path: move.to };
    }
  }

  return { status: "ok", moves };
}
