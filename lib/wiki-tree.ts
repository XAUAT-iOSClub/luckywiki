import { splitPath } from "@/lib/wiki-path";

export type TreeArticle = {
  path: string;
  title: string;
};

export type WikiTreeNode = {
  segment: string;
  path: string;
  label: string;
  articleTitle?: string;
  children: WikiTreeNode[];
};

export function buildWikiTree(articles: TreeArticle[]) {
  const root: WikiTreeNode = {
    segment: "",
    path: "",
    label: "Wiki",
    children: [],
  };

  for (const article of articles) {
    if (article.path === "") {
      root.articleTitle = article.title;
      root.label = article.title;
      continue;
    }

    let current = root;
    const segments = splitPath(article.path);

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join("/");
      let child = current.children.find((candidate) => candidate.segment === segment);

      if (!child) {
        child = {
          segment,
          path,
          label: segment,
          children: [],
        };
        current.children.push(child);
      }

      current = child;
    }

    current.articleTitle = article.title;
    current.label = article.title;
  }

  sortTree(root);
  return root;
}

export function isNodeExpanded(nodePath: string, currentPath: string) {
  if (!nodePath) {
    return true;
  }

  return currentPath === nodePath || currentPath.startsWith(`${nodePath}/`);
}

function sortTree(node: WikiTreeNode) {
  node.children.sort((left, right) => left.segment.localeCompare(right.segment, "zh-Hans-CN"));

  for (const child of node.children) {
    sortTree(child);
  }
}
