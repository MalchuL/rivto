/**
 * Derives table-of-contents entries from writing and callout Markdown.
 *
 * Entries are computed from the live document. Nothing in this module writes
 * a heading cache back onto the table-of-contents block.
 *
 * @module
 */
import { fromMarkdown } from "mdast-util-from-markdown";

/**
 * Default writing block type.
 *
 * Kept as a literal so node tests can import this module without loading the
 * React editor. It matches `DEFAULT_WRITING_BLOCK_TYPE`.
 */
export const TOC_WRITING_BLOCK_TYPE = "paragraph";

/**
 * Callout block type whose Markdown body also contributes headings.
 *
 * Kept as a literal for the same reason as {@link TOC_WRITING_BLOCK_TYPE}.
 * It matches `CALLOUT_BLOCK_TYPE`.
 */
export const TOC_CALLOUT_BLOCK_TYPE = "demo.callout";

/** Block types whose Markdown bodies contribute headings. */
export const TOC_HEADING_BLOCK_TYPES: readonly string[] = [
  TOC_WRITING_BLOCK_TYPE,
  TOC_CALLOUT_BLOCK_TYPE,
];

const HEADING_BLOCK_TYPES = new Set(TOC_HEADING_BLOCK_TYPES);

/** One block the table-of-contents walker can read without retaining children. */
export interface TocBlockSnapshot {
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly childIds: readonly string[];
}

/** Read API used to walk a parent subtree or the root forest. */
export interface TocDocumentView {
  /** @param id - Block identifier. @returns The node, or undefined when it is gone. */
  getBlock(id: string): TocBlockSnapshot | undefined;
  /**
   * @param id - Block identifier.
   * @returns Parent identifier, null for a root, or undefined when the block is absent.
   */
  getParentId(id: string): string | null | undefined;
  /** @returns Root identifiers in document order. */
  getRootIds(): readonly string[];
}

/** One heading discovered in document order. */
export interface TocEntry {
  /** Block whose Markdown body contains the heading. */
  readonly blockId: string;
  /** ATX or Setext depth from 1 through 6. */
  readonly depth: number;
  /** Plain heading text, with repeated headings kept as separate entries. */
  readonly text: string;
}

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  alt?: string;
  children?: MarkdownNode[];
}

/**
 * Returns whether converting the block to a table of contents would keep its text.
 *
 * Slash menus store the typed `/query` in the block until the command runs, then
 * delete that query before conversion. A block is eligible when it is empty or
 * its entire content is that not-yet-removed query. Any other text stays put,
 * so the command is hidden instead of dropping it from the rendered document.
 *
 * @param content - Current block content, including an in-progress slash query.
 * @returns True when conversion would leave the content empty.
 */
export function isTocConversionAvailable(content: string): boolean {
  if (content === "") return true;
  const slashIndex = content.lastIndexOf("/");
  if (slashIndex < 0) return false;
  const query = content.slice(slashIndex + 1);
  if (/\s/.test(query)) return false;
  return content.slice(0, slashIndex) === "";
}

/** Reads the plain text of one inline Markdown node. */
function inlineText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "break") return " ";
  if (!node.children) return "";
  return node.children.map(inlineText).join("");
}

/**
 * Lists ATX and Setext headings in source order.
 *
 * `mdast-util-from-markdown` parses CommonMark, so fenced and indented code
 * become code nodes and never appear as headings. Repeated heading text is
 * preserved because each heading node becomes its own entry.
 *
 * @param markdown - Raw Markdown stored on one writing or callout block.
 * @returns Headings in the order they appear in that body.
 */
export function extractMarkdownHeadings(markdown: string): readonly { depth: number; text: string }[] {
  const tree = fromMarkdown(markdown) as MarkdownNode;
  const headings: { depth: number; text: string }[] = [];
  const visit = (node: MarkdownNode): void => {
    if (node.type === "code") return;
    if (node.type === "heading" && node.depth && node.depth >= 1 && node.depth <= 6) {
      headings.push({
        depth: node.depth,
        text: (node.children ?? []).map(inlineText).join(""),
      });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return headings;
}

/**
 * Lists headings visible to one table-of-contents block.
 *
 * A nested table of contents covers its parent and that parent's descendants.
 * A root table of contents has no parent, so it covers the root forest in
 * document order. The walk is preorder: a block's own headings precede its
 * children, and siblings stay in child-list order.
 *
 * @param document - Current block tree.
 * @param tocId - Table-of-contents block whose scope should be read.
 * @returns Heading entries. An unknown table of contents contributes none.
 */
export function collectTocEntries(document: TocDocumentView, tocId: string): readonly TocEntry[] {
  const parentId = document.getParentId(tocId);
  if (parentId === undefined) return [];
  const roots = parentId === null ? document.getRootIds() : [parentId];
  const entries: TocEntry[] = [];
  const visit = (id: string): void => {
    const block = document.getBlock(id);
    if (!block) return;
    if (HEADING_BLOCK_TYPES.has(block.type)) {
      for (const heading of extractMarkdownHeadings(block.content)) {
        entries.push({ blockId: block.id, depth: heading.depth, text: heading.text });
      }
    }
    for (const childId of block.childIds) visit(childId);
  };
  for (const rootId of roots) visit(rootId);
  return entries;
}
