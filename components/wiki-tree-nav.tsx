import Link from "next/link";
import { buildWikiHref } from "@/lib/wiki-path";
import { isNodeExpanded, type WikiTreeNode } from "@/lib/wiki-tree";

export function WikiTreeNav({
  tree,
  currentPath,
}: {
  tree: WikiTreeNode;
  currentPath: string;
}) {
  return (
    <nav aria-label="Wiki navigation" className="space-y-2 text-sm">
      {tree.articleTitle ? (
        <Link
          className={currentPath === "" ? "tree-link tree-link-active" : "tree-link"}
          href="/wiki"
        >
          {tree.articleTitle}
        </Link>
      ) : null}
      <ul className="space-y-2">
        {tree.children.map((node) => (
          <TreeBranch currentPath={currentPath} key={node.path} node={node} />
        ))}
      </ul>
    </nav>
  );
}

function TreeBranch({
  node,
  currentPath,
}: {
  node: WikiTreeNode;
  currentPath: string;
}) {
  const href = buildWikiHref(node.path);
  const active = currentPath === node.path;
  const expanded = isNodeExpanded(node.path, currentPath);

  if (node.children.length === 0) {
    return (
      <li>
        <Link className={active ? "tree-link tree-link-active" : "tree-link"} href={href}>
          {node.label}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <details open={expanded}>
        <summary className="tree-summary">
          {node.articleTitle ? (
            <Link className={active ? "tree-link tree-link-active" : "tree-link"} href={href}>
              {node.label}
            </Link>
          ) : (
            <span className="tree-label">{node.label}</span>
          )}
        </summary>
        <ul className="mt-2 space-y-2 border-l border-border/70 pl-4">
          {node.children.map((child) => (
            <TreeBranch currentPath={currentPath} key={child.path} node={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}
