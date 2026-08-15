import { extractPageText, type Page } from "@chulane/app";

export type PageTreeNode = {
  page: Page;
  children: PageTreeNode[];
};

/** Builds a parent/child tree; pages with missing parents become roots. */
export function buildPageTree(pages: Page[]): PageTreeNode[] {
  const nodes = new Map<string, PageTreeNode>();
  for (const page of pages) {
    nodes.set(page.id, { page, children: [] });
  }
  const roots: PageTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.page.parentPageId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byTitle = (a: PageTreeNode, b: PageTreeNode) =>
    a.page.title.localeCompare(b.page.title);
  const sortDeep = (list: PageTreeNode[]) => {
    list.sort(byTitle);
    for (const node of list) sortDeep(node.children);
  };
  sortDeep(roots);
  return roots;
}

/** Plain-text preview of persisted Rivto snapshot JSON (or leftover HTML). */
export function stripHtml(content: string): string {
  return extractPageText(content);
}
