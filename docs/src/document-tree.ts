/**
 * Derives ordered hierarchical navigation and creation paths from Markdown files.
 * Numeric filename prefixes own sibling ordering. A page and folder with the
 * same basename become one clickable page node with nested children.
 */

import type { DocumentationPage } from "./documents";

const ORDER_STEP = 10;

export interface DocumentationPageNode {
  kind: "page";
  page: DocumentationPage;
  children: DocumentationNavigationNode[];
}

export interface DocumentationFolderNode {
  kind: "folder";
  name: string;
  path: string;
  children: DocumentationNavigationNode[];
}

export type DocumentationNavigationNode = DocumentationPageNode | DocumentationFolderNode;
export type DocumentationPagePlacement = "sibling" | "child";

/**
 * Builds a recursive navigation tree from slash-separated page paths.
 *
 * @param pages Canonical Markdown pages from the documentation repository.
 * @param parentPath Current folder path during recursion.
 * @returns Page and folder nodes sorted by numeric prefix.
 */
export function buildDocumentationTree(
  pages: readonly DocumentationPage[],
  parentPath = "",
): DocumentationNavigationNode[] {
  const prefix = parentPath ? `${parentPath}/` : "";
  const directPages: DocumentationPage[] = [];
  const folderNames = new Set<string>();

  for (const page of pages) {
    if (!page.path.startsWith(prefix)) {
      continue;
    }
    const relativePath = page.path.slice(prefix.length);
    const separatorIndex = relativePath.indexOf("/");
    if (separatorIndex === -1) {
      directPages.push(page);
    } else {
      folderNames.add(relativePath.slice(0, separatorIndex));
    }
  }

  const nodes: DocumentationNavigationNode[] = directPages.map(function createPageNode(page) {
    const basename = getPageBasename(page.path);
    const folderPath = parentPath ? `${parentPath}/${basename}` : basename;
    const hasMatchingFolder = folderNames.delete(basename);
    return {
      kind: "page",
      page,
      children: hasMatchingFolder ? buildDocumentationTree(pages, folderPath) : [],
    };
  });

  for (const folderName of folderNames) {
    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    nodes.push({
      kind: "folder",
      name: formatPathSegment(folderName),
      path: folderPath,
      children: buildDocumentationTree(pages, folderPath),
    });
  }

  return nodes.sort(compareNavigationNodes);
}

/**
 * Creates the next numerically ordered Markdown path relative to a selected page.
 *
 * @param pages Existing canonical Markdown pages.
 * @param selectedPath Page that establishes the sibling or child level.
 * @param placement Whether the new page is beside or beneath the selected page.
 * @param title Human-readable page title entered by the user.
 * @returns Collision-free ordered Markdown path.
 */
export function createDocumentationPagePath(
  pages: readonly DocumentationPage[],
  selectedPath: string,
  placement: DocumentationPagePlacement,
  title: string,
): string {
  const selectedParent = getParentPath(selectedPath);
  const targetParent = placement === "child"
    ? [selectedParent, getPageBasename(selectedPath)].filter(Boolean).join("/")
    : selectedParent;
  const targetPrefix = targetParent ? `${targetParent}/` : "";
  const siblingOrders = pages.flatMap(function readSiblingOrder(page) {
    if (getParentPath(page.path) !== targetParent) {
      return [];
    }
    const order = parseNumericPrefix(getPageBasename(page.path));
    return Number.isFinite(order) ? [order] : [];
  });
  const nextOrder = siblingOrders.length > 0 ? Math.max(...siblingOrders) + ORDER_STEP : ORDER_STEP;
  const orderPrefix = String(nextOrder).padStart(2, "0");
  return `${targetPrefix}${orderPrefix}-${slugifyPageTitle(title)}.md`;
}

/**
 * Compares page and folder nodes by numeric prefix, then stable path text.
 *
 * @param left First navigation node.
 * @param right Second navigation node.
 * @returns Numeric order followed by locale-aware path order.
 */
function compareNavigationNodes(
  left: DocumentationNavigationNode,
  right: DocumentationNavigationNode,
): number {
  const leftPath = left.kind === "page" ? left.page.path : left.path;
  const rightPath = right.kind === "page" ? right.page.path : right.path;
  const leftSegment = leftPath.split("/").at(-1) ?? leftPath;
  const rightSegment = rightPath.split("/").at(-1) ?? rightPath;
  return parseNumericPrefix(leftSegment) - parseNumericPrefix(rightSegment) || leftPath.localeCompare(rightPath);
}

/**
 * Reads a leading integer followed by a hyphen, or places unnumbered items last.
 *
 * @param segment Filename or directory segment.
 * @returns Parsed order or positive infinity when no prefix exists.
 */
function parseNumericPrefix(segment: string): number {
  const value = Number.parseInt(segment.match(/^(\d+)-/)?.[1] ?? "", 10);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Removes the Markdown extension from the last path segment.
 *
 * @param pagePath Canonical relative Markdown path.
 * @returns Filename basename used by a matching child directory.
 */
function getPageBasename(pagePath: string): string {
  return pagePath.split("/").at(-1)?.replace(/\.md$/i, "") ?? pagePath;
}

/**
 * Reads a page's containing directory using slash-separated canonical paths.
 *
 * @param pagePath Canonical relative Markdown path.
 * @returns Parent path or an empty string for root pages.
 */
function getParentPath(pagePath: string): string {
  return pagePath.split("/").slice(0, -1).join("/");
}

/**
 * Converts a title into a conservative Unicode filename slug.
 *
 * @param title Human-readable page title.
 * @returns Non-empty lowercase filename segment.
 */
function slugifyPageTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replaceAll(/^-|-$/g, "");
  return slug || "page";
}

/**
 * Converts an ordered filesystem segment into a readable folder label.
 *
 * @param segment Raw directory name.
 * @returns Capitalized label without its numeric prefix.
 */
function formatPathSegment(segment: string): string {
  const words = segment.replace(/^\d+-/, "").replaceAll(/[-_]/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
