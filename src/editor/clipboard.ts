import type { DocumentModelImpl, Block, BlockInput, Link } from "../store/document-model";
import { DEFAULT_BLOCK_TYPE } from "../blocks";
import { isBlockCollapsed } from "../utils";
import type { EditorPosition, EditorSelection, EditorSelectionItem } from "./types";

/** MIME type carrying Rivto's lossless structured clipboard bundle. */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

/** Structured block clipboard payload stored alongside HTML and plain text. */
export interface ClipboardBundle {
  /** Clipboard schema version, independent from document snapshot versions. */
  version: 1;
  /** Whether copied content begins with partial text; omitted legacy bundles mean blocks. */
  startsWithText?: boolean;
  /** Selected block subtrees preserving native types, props, plugin data, and layout. */
  blocks: Block[];
  /** Links whose endpoints are both inside the copied block set. */
  links: Link[];
}

/** Browser-ready clipboard representations produced from one editor selection. */
export interface ClipboardPayload {
  /** Lossless Rivto representation. */
  bundle: ClipboardBundle;
  /** Interoperable HTML fallback. */
  html: string;
  /** Universal plain-text fallback. */
  text: string;
}

/** A directed editor selection normalized into visible document order. */
export interface NormalizedSelection {
  /** Earlier block and UTF-16 offset, regardless of gesture direction. */
  start: EditorPosition;
  /** Later block and UTF-16 offset. */
  end: EditorPosition;
  /** Detached blocks touched by the range in visible depth-first order. */
  blocks: Block[];
}

/** Clipboard values with fresh identities ready for insertion. */
interface RemappedClipboardBundle {
  blocks: BlockInput[];
  firstChildren: BlockInput[];
  links: Link[];
}

type SelectionWriter = {
  set(selection: EditorSelection): void;
  clear(): void;
};

/** Returns detached blocks in visible depth-first order. */
export function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/** Deep-clones portable block data before clipboard trimming mutates it. */
function cloneBlock(block: Block): Block {
  return {
    ...block,
    props: { ...block.props },
    pluginData: { ...block.pluginData },
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(cloneBlock),
  };
}

/** Finds one detached block recursively by stable ID. */
function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

/** Builds child-to-parent lookup data for selected-root normalization. */
function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Normalizes the complete local selection list into one clipboard range.
 *
 * Block-only items remain a possibly non-contiguous set of complete blocks.
 * When text and block items coexist, they describe one visual range: text
 * items provide partial boundaries and block items contribute complete blocks.
 * Clipboard mutation therefore uses the earliest start and latest end and
 * includes every visible block between them.
 */
export function normalizeSelection(document: DocumentModelImpl, selection: EditorSelection): NormalizedSelection | undefined {
  if (!selection.length) return undefined;
  const all = flattenBlocks(document.document);
  const indices = new Map(all.map((block, index) => [block.id, index]));

  const normalizeItem = (item: EditorSelectionItem): NormalizedSelection | undefined => {
    if (item.type !== "text") {
      const selected = new Set(item.blockIds);
      const blocks = all.filter((block) => selected.has(block.id));
      const first = blocks[0];
      const last = blocks.at(-1);
      return first && last ? {
        start: { blockId: first.id, offset: 0 },
        end: { blockId: last.id, offset: last.content.length },
        blocks,
      } : undefined;
    }
    const anchorIndex = indices.get(item.anchor.blockId);
    const headIndex = indices.get(item.head.blockId);
    if (anchorIndex === undefined || headIndex === undefined) return undefined;
    const forward = anchorIndex < headIndex || (anchorIndex === headIndex && item.anchor.offset <= item.head.offset);
    const start = forward ? item.anchor : item.head;
    const end = forward ? item.head : item.anchor;
    return {
      start: { ...start },
      end: { ...end },
      blocks: all.slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1),
    };
  };

  const ranges = selection.flatMap((item) => {
    const range = normalizeItem(item);
    return range ? [range] : [];
  });
  if (!ranges.length) return undefined;

  if (!selection.some((item) => item.type === "text")) {
    const selected = new Set(ranges.flatMap((range) => range.blocks.map((block) => block.id)));
    const blocks = all.filter((block) => selected.has(block.id));
    const first = blocks[0];
    const last = blocks.at(-1);
    if (!first || !last) return undefined;
    return {
      start: { blockId: first.id, offset: 0 },
      end: { blockId: last.id, offset: last.content.length },
      blocks,
    };
  }

  const compare = (left: EditorPosition, right: EditorPosition): number => {
    const blockDifference = (indices.get(left.blockId) ?? -1) - (indices.get(right.blockId) ?? -1);
    return blockDifference || left.offset - right.offset;
  };
  const starts = ranges.map((range) => range.start);
  const ends = ranges.map((range) => range.end);
  const start = starts.reduce((earliest, position) => compare(position, earliest) < 0 ? position : earliest);
  const end = ends.reduce((latest, position) => compare(position, latest) > 0 ? position : latest);
  const startIndex = indices.get(start.blockId);
  const endIndex = indices.get(end.blockId);
  if (startIndex === undefined || endIndex === undefined) return undefined;
  return {
    start: { ...start },
    end: { ...end },
    blocks: all.slice(startIndex, endIndex + 1),
  };
}

/** Clones selected roots once, excluding roots already carried by an ancestor. */
function selectedTopLevelSubtrees(document: DocumentModelImpl, range: NormalizedSelection, wholeBlocks: boolean): Block[] {
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(document.document);
  const cloneSelection = (block: Block): Block => ({
    ...cloneBlock(block),
    children: block.children.filter((child) => selectedIds.has(child.id)).map(cloneSelection),
  });
  return range.blocks.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }).map(wholeBlocks ? cloneBlock : cloneSelection);
}

/** Escapes plain block text for the interoperable HTML clipboard flavor. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

/**
 * Serializes the current selection to structured, HTML, and plain text forms.
 *
 * Boundary text blocks are trimmed on clones only. The collaborative document
 * is never patched while preparing clipboard data.
 */
export function createClipboardPayload(document: DocumentModelImpl, selection: EditorSelection): ClipboardPayload | undefined {
  const range = normalizeSelection(document, selection);
  if (!range?.blocks.length) return undefined;
  const blocks = selectedTopLevelSubtrees(document, range, !selection.some((item) => item.type === "text"));
  const start = findBlock(blocks, range.start.blockId);
  const end = findBlock(blocks, range.end.blockId);
  if (!start || !end) return undefined;
  if (start === end) start.content = start.content.slice(range.start.offset, range.end.offset);
  else {
    start.content = start.content.slice(range.start.offset);
    end.content = end.content.slice(0, range.end.offset);
  }
  const visible = flattenBlocks(blocks);
  const ids = new Set(visible.map((block) => block.id));
  const links = document.links.filter((link) => ids.has(link.from.blockId) && ids.has(link.to.blockId));
  return {
    bundle: { version: 1, startsWithText: selection[0]?.type === "text", blocks, links },
    html: visible.map((block) => `<p>${escapeHtml(block.content)}</p>`).join(""),
    text: visible.map((block) => block.content).join("\n"),
  };
}

/** Gives pasted blocks and links fresh IDs, optionally reusing the text target. */
function remapClipboardBundle(bundle: ClipboardBundle, firstTargetId?: string): RemappedClipboardBundle {
  if (
    bundle.version !== 1 ||
    !Array.isArray(bundle.blocks) ||
    !Array.isArray(bundle.links)
  ) {
    throw new Error("Unsupported Rivto clipboard payload");
  }
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
  const [first, ...rest] = bundle.blocks;
  if (first && firstTargetId) idMap.set(first.id, firstTargetId);
  const firstChildren = first && firstTargetId ? first.children.map(remap) : [];
  const blocks = firstTargetId ? rest.map(remap) : bundle.blocks.map(remap);
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
  return { blocks, firstChildren, links };
}

/** Publishes one collapsed portable text caret. */
function collapse(selection: SelectionWriter, blockId: string, offset: number): void {
  selection.set([{ type: "text", anchor: { blockId, offset }, head: { blockId, offset } }]);
}

/** Removes every selected block after the surviving first text boundary. */
function removeRangeTail(document: DocumentModelImpl, range: NormalizedSelection): void {
  range.blocks.slice(1).forEach((block) => document.removeBlock(block.id));
}

/** Location for roots inserted by a normal structured paste. */
interface BlockPastePlacement {
  /** Initial sibling after which temporary roots are inserted. */
  afterId?: string | null;
  /** Existing first child before which every pasted root is finally moved. */
  beforeChildId?: string;
}

/** Inserts a complete structured bundle as one CRDT transaction and undo step. */
function insertBundleAsBlocks(
  document: DocumentModelImpl,
  selection: SelectionWriter,
  bundle: ClipboardBundle,
  placement: BlockPastePlacement = {},
): void {
  const remapped = remapClipboardBundle(bundle);
  let lastId: string | undefined;
  document.transact(() => {
    const insertedIds: string[] = [];
    let previous = placement.afterId;
    remapped.blocks.forEach((block) => {
      previous = document.insertBlock(block, previous ?? undefined);
      insertedIds.push(previous);
    });
    if (placement.beforeChildId && insertedIds.length) {
      document.moveBlocks(insertedIds, placement.beforeChildId, "before");
    }
    lastId = insertedIds.at(-1);
    remapped.links.forEach((link) => document.createLink(link));
  });
  if (lastId) selection.set([{ type: "block", blockIds: [lastId], anchorBlockId: lastId, focusBlockId: lastId }]);
}

/**
 * Pastes a structured Rivto block bundle at the current selection.
 *
 * A bundle beginning with selected text merges that text into a text target by
 * default, while a whole-block bundle remains block-shaped. Passing
 * `mergeText: false` explicitly keeps partial text as blocks. Every mutation
 * runs inside one outer CRDT transaction so undo and collaborators never
 * observe a partial paste.
 */
export function pasteClipboardBundle(
  document: DocumentModelImpl,
  selection: SelectionWriter,
  current: EditorSelection,
  bundle: ClipboardBundle,
  mergeText = true,
): void {
  if (!bundle.blocks.length) return;
  const hasTextTarget = current.some((item) => item.type === "text");
  if (!mergeText || bundle.startsWithText !== true || !hasTextTarget) {
    const active = current.at(-1);
    const range = normalizeSelection(document, current);
    const afterId = active?.type === "block"
      ? active.focusBlockId
      : active?.type === "edgeless"
        ? active.blockIds.at(-1)
        : active?.type === "text"
          ? active.head.blockId
          : range?.blocks.at(-1)?.id;
    const caretBlock = active?.type === "text" ? findBlock(document.document, active.head.blockId) : undefined;

    // A collapsed parent is a visible leaf, while every expanded block with
    // children receives pasted roots before its existing first child.
    const beforeChildId = !caretBlock || isBlockCollapsed(caretBlock)
      ? undefined
      : caretBlock.children[0]?.id;
    insertBundleAsBlocks(document, selection, bundle, { afterId, beforeChildId });
    return;
  }
  const range = normalizeSelection(document, current);
  if (!range) {
    insertBundleAsBlocks(document, selection, bundle);
    return;
  }
  const target = range.blocks[0]!;
  const first = bundle.blocks[0]!;
  const prefix = target.content.slice(0, range.start.offset);
  const suffix = range.blocks.at(-1)?.content.slice(range.end.offset) ?? "";
  const remapped = remapClipboardBundle(bundle, target.id);
  let previous = target.id;
  let caretOffset = prefix.length + first.content.length;
  // This is the atomic boundary for replacement plus every inserted block,
  // child, and link. It must remain outside the loops so Undo removes the whole
  // paste in one step and collaborators never observe a half-pasted document.
  document.transact(() => {
    removeRangeTail(document, range);
    document.setBlockText(target.id, prefix + first.content + (remapped.blocks.length ? "" : suffix));
    remapped.firstChildren.forEach((child) => {
      const childId = document.insertBlock(child, target.id);
      document.indentBlock(childId);
    });
    remapped.blocks.forEach((block, index) => {
      const pastedLength = block.content?.length ?? 0;
      const isLast = index === remapped.blocks.length - 1;
      previous = document.insertBlock({ ...block, content: `${block.content ?? ""}${isLast ? suffix : ""}` }, previous);
      if (isLast) caretOffset = pastedLength;
    });
    remapped.links.forEach((link) => document.createLink(link));
  });
  collapse(selection, previous, caretOffset);
}

/**
 * Pastes plain text. Multiline text becomes sibling paragraph blocks.
 *
 * The first line merges into the current block at the caret, following lines
 * become siblings, and the old suffix moves to the last inserted block.
 */
export function pastePlainText(
  document: DocumentModelImpl,
  selection: SelectionWriter,
  current: EditorSelection,
  defaultBlockType: string,
  value: string,
): void {
  const range = normalizeSelection(document, current);
  const lines = value.split(/\r\n?|\n/);
  if (!range) {
    let lastId: string | undefined;
    document.transact(() => {
      lines.forEach((line) => {
        lastId = document.insertBlock({ type: defaultBlockType, content: line }, lastId);
      });
    });
    if (lastId) collapse(selection, lastId, lines.at(-1)?.length ?? 0);
    return;
  }
  const target = range.blocks[0]!;
  const end = range.blocks.at(-1) ?? target;
  const prefix = target.content.slice(0, range.start.offset);
  const suffix = end.content.slice(range.end.offset);
  if (lines.length === 1) {
    document.transact(() => {
      removeRangeTail(document, range);
      document.setBlockText(target.id, prefix + value + suffix);
    });
    collapse(selection, target.id, prefix.length + value.length);
    return;
  }
  let previous = target.id;
  let lastId = target.id;
  document.transact(() => {
    removeRangeTail(document, range);
    document.setBlockText(target.id, prefix + lines[0]!);
    lines.slice(1).forEach((line, index, rest) => {
      const isLast = index === rest.length - 1;
      lastId = document.insertBlock({ type: defaultBlockType, content: `${line}${isLast ? suffix : ""}` }, previous);
      previous = lastId;
    });
  });
  collapse(selection, lastId, lines.at(-1)?.length ?? 0);
}

/**
 * Deletes the current heterogeneous selection as one document transaction.
 *
 * Text selection removes its normalized range and collapses to the surviving
 * boundary. A block-only selection removes complete subtrees. Deleting every
 * root creates one empty default block so keyboard editing always has a target.
 */
export function deleteSelection(
  document: DocumentModelImpl,
  selection: SelectionWriter,
  current: EditorSelection,
  defaultBlockType = DEFAULT_BLOCK_TYPE,
): void {
  const range = normalizeSelection(document, current);
  if (!range) return;
  if (!current.some((item) => item.type === "text")) {
    const visibleBefore = flattenBlocks(document.document);
    const firstRemovedIndex = Math.max(0, visibleBefore.findIndex((block) => block.id === range.blocks[0]?.id));
    let caretBlockId: string | undefined;
    document.transact(() => {
      range.blocks.forEach((block) => document.removeBlock(block.id));
      if (!document.document.length) {
        caretBlockId = document.insertBlock({ type: defaultBlockType, content: "" });
        return;
      }

      // Prefer the block that moved into the first removed block's position.
      // When deletion removed the tail, clamp to the last surviving block.
      // Publishing this zero-length text selection keeps subsequent keyboard
      // commands selection-driven even after deleting whole blocks.
      const remaining = flattenBlocks(document.document);
      caretBlockId = remaining[Math.min(firstRemovedIndex, remaining.length - 1)]?.id;
    });
    if (caretBlockId) collapse(selection, caretBlockId, 0);
    else selection.clear();
    return;
  }
  pastePlainText(document, selection, current, defaultBlockType, "");
}

/** Copies then deletes selected text or block subtrees. */
export function cutSelection(document: DocumentModelImpl, selection: SelectionWriter, current: EditorSelection): ClipboardPayload | undefined {
  const payload = createClipboardPayload(document, current);
  if (!payload) return;
  deleteSelection(document, selection, current);
  return payload;
}

/** Converts interoperable HTML clipboard data to visible plain text. */
export function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}
