import type { Block, BlockInput, DocumentModelImpl, Link } from "../../store/document-model";
import type { EditorSelection } from "../editor/types";

/** Structured Rivto clipboard payload stored alongside HTML and plain text. */
export interface ClipboardBundle {
  /** Clipboard schema version, independent from document snapshot versions. */
  version: 1;
  /** Selected block subtrees preserving native types and plugin data. */
  blocks: Block[];
  /** Links whose endpoints are both inside the copied block set. */
  links: Link[];
}

/** Browser-ready representations produced from one editor selection. */
export interface ClipboardPayload {
  /** Lossless Rivto representation. */
  bundle: ClipboardBundle;
  /** Interoperable HTML fallback. */
  html: string;
  /** Universal plain-text fallback. */
  text: string;
}

/** Flattens block trees in visible depth-first document order. */
export function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/**
 * Selects top-level copied subtrees from a directed editor range.
 *
 * Descendants are removed when their ancestor is already selected, preventing
 * duplicate insertion while retaining the ancestor's nested children.
 */
export function getSelectedBlocks(document: DocumentModelImpl, selection: EditorSelection | null): Block[] {
  if (!selection) return [];
  const tree = document.document;
  const all = flattenBlocks(tree);
  const start = all.findIndex((block) => block.id === selection.anchor.blockId);
  const end = all.findIndex((block) => block.id === selection.head.blockId);
  if (start < 0 || end < 0) return [];
  const selected = all.slice(Math.min(start, end), Math.max(start, end) + 1);
  const selectedIds = new Set(selected.map((block) => block.id));
  const parents = new Map<string, string>();
  const indexParents = (blocks: Block[]): void => blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children);
  });
  indexParents(tree);
  return selected.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  });
}

/**
 * Computes a normalized text range when both selection points belong to one block.
 */
export function getTextRange(block: Block, selection: EditorSelection | null): { text: string; from: number; to: number } | undefined {
  if (!selection || selection.anchor.blockId !== block.id || selection.head.blockId !== block.id) return;
  return {
    text: block.content,
    from: Math.min(selection.anchor.offset, selection.head.offset),
    to: Math.max(selection.anchor.offset, selection.head.offset),
  };
}

/** Escapes plain block content before placing it into an HTML clipboard fallback. */
export function escapeClipboardHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

/**
 * Creates structured, HTML, and plain-text representations for a selection.
 */
export function createClipboardPayload(document: DocumentModelImpl, selection: EditorSelection | null): ClipboardPayload | undefined {
  const blocks = getSelectedBlocks(document, selection);
  if (!blocks.length) return;
  const ids = new Set(flattenBlocks(blocks).map((block) => block.id));
  const links = document.links.filter((link) => ids.has(link.from.blockId) && ids.has(link.to.blockId));
  let text = blocks.map((block) => block.content).join("\n");
  if (blocks.length === 1) {
    const range = getTextRange(blocks[0], selection);
    if (range) text = range.text.slice(range.from, range.to);
  }
  return {
    bundle: { version: 1, blocks, links },
    html: blocks.map((block) => `<p>${escapeClipboardHtml(block.content)}</p>`).join(""),
    text,
  };
}

/**
 * Remaps every copied block and link ID before insertion into another location.
 *
 * @returns Detached insertion values and links with a small visible canvas offset.
 */
export function remapClipboardBundle(bundle: ClipboardBundle): { blocks: BlockInput[]; links: Link[] } {
  if (bundle.version !== 1 || !Array.isArray(bundle.blocks)) throw new Error("Unsupported Rivto clipboard payload");
  const idMap = new Map<string, string>();
  const remap = (block: Block): BlockInput => {
    const id = crypto.randomUUID();
    idMap.set(block.id, id);
    return {
      ...block,
      id,
      layout: block.layout ? { ...block.layout, x: block.layout.x + 24, y: block.layout.y + 24 } : undefined,
      children: block.children.map(remap),
    };
  };
  const blocks = bundle.blocks.map(remap);
  const links = bundle.links.flatMap((link) => {
    const from = idMap.get(link.from.blockId);
    const to = idMap.get(link.to.blockId);
    return from && to ? [{
      ...link,
      id: crypto.randomUUID(),
      from: { ...link.from, blockId: from },
      to: { ...link.to, blockId: to },
    }] : [];
  });
  return { blocks, links };
}
