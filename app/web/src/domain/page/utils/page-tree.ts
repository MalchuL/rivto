import type { Page } from "@chulane/app";

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

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
