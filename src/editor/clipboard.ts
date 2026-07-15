import type { DocumentModelImpl, Block, BlockInput, Link } from "../store/document-model";
import type { EditorPosition, EditorSelection } from "./types";

/** MIME type carrying Rivto's lossless structured clipboard bundle. */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

/** Structured block clipboard payload stored alongside HTML and plain text. */
export interface ClipboardBundle {
  /** Clipboard schema version, independent from document snapshot versions. */
  version: 1;
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

function cloneBlock(block: Block): Block {
  return {
    ...block,
    props: { ...block.props },
    pluginData: { ...block.pluginData },
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(cloneBlock),
  };
}

function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Normalizes local selection into document order.
 *
 * UI selection keeps anchor/focus direction for gestures. Clipboard mutation
 * needs a stable start/end boundary so backwards text selection, range copy,
 * cut, and paste all observe the same block slice.
 */
export function normalizeSelection(document: DocumentModelImpl, selection: EditorSelection | null): NormalizedSelection | undefined {
  if (!selection) return undefined;
  const all = flattenBlocks(document.document);
  if (selection.type !== "text") {
    const selected = new Set(selection.blockIds);
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
  const anchorIndex = all.findIndex((block) => block.id === selection.anchor.blockId);
  const headIndex = all.findIndex((block) => block.id === selection.head.blockId);
  if (anchorIndex < 0 || headIndex < 0) return undefined;
  const forward = anchorIndex < headIndex || (anchorIndex === headIndex && selection.anchor.offset <= selection.head.offset);
  const start = forward ? selection.anchor : selection.head;
  const end = forward ? selection.head : selection.anchor;
  return {
    start: { ...start },
    end: { ...end },
    blocks: all.slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1),
  };
}

function selectedTopLevelSubtrees(document: DocumentModelImpl, range: NormalizedSelection): Block[] {
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(document.document);
  return range.blocks.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }).map(cloneBlock);
}

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
export function createClipboardPayload(document: DocumentModelImpl, selection: EditorSelection | null): ClipboardPayload | undefined {
  const range = normalizeSelection(document, selection);
  if (!range?.blocks.length) return undefined;
  const blocks = selectedTopLevelSubtrees(document, range);
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
    bundle: { version: 1, blocks, links },
    html: visible.map((block) => `<p>${escapeHtml(block.content)}</p>`).join(""),
    text: visible.map((block) => block.content).join("\n"),
  };
}

function remapClipboardBundle(bundle: ClipboardBundle, firstTargetId?: string): RemappedClipboardBundle {
  if (bundle.version !== 1 || !Array.isArray(bundle.blocks) || !Array.isArray(bundle.links)) {
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

function collapse(selection: SelectionWriter, blockId: string, offset: number): void {
  selection.set({ type: "text", anchor: { blockId, offset }, head: { blockId, offset } });
}

function removeRangeTail(document: DocumentModelImpl, range: NormalizedSelection): void {
  range.blocks.slice(1).forEach((block) => document.removeBlock(block.id));
}

function insertBlocksAfter(document: DocumentModelImpl, blocks: BlockInput[], afterId?: string | null): string | undefined {
  let previous = afterId;
  blocks.forEach((block) => {
    previous = document.insertBlock(block, previous ?? undefined);
  });
  return previous ?? undefined;
}

function insertBundleAsBlocks(document: DocumentModelImpl, selection: SelectionWriter, bundle: ClipboardBundle, afterId?: string | null): void {
  const remapped = remapClipboardBundle(bundle);
  let lastId: string | undefined;
  document.transact(() => {
    lastId = insertBlocksAfter(document, remapped.blocks, afterId);
    remapped.links.forEach((link) => document.createLink(link));
  });
  if (lastId) selection.set({ type: "block", blockIds: [lastId], anchorBlockId: lastId, focusBlockId: lastId });
}

/**
 * Pastes a structured Rivto block bundle at the current selection.
 *
 * Text selections consume the first copied root into the current block, which
 * preserves the target block's type and metadata. Block and edgeless selections
 * paste fresh block subtrees after the active selected block.
 */
export function pasteClipboardBundle(
  document: DocumentModelImpl,
  selection: SelectionWriter,
  current: EditorSelection | null,
  bundle: ClipboardBundle,
): void {
  if (!bundle.blocks.length) return;
  if (current?.type !== "text") {
    const afterId = current?.type === "block" ? current.focusBlockId : current?.blockIds.at(-1);
    insertBundleAsBlocks(document, selection, bundle, afterId);
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
  current: EditorSelection | null,
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

/** Copies then removes the selected text range or selected block subtrees. */
export function cutSelection(document: DocumentModelImpl, selection: SelectionWriter, current: EditorSelection | null): ClipboardPayload | undefined {
  const payload = createClipboardPayload(document, current);
  const range = normalizeSelection(document, current);
  if (!payload || !range) return payload;
  if (current?.type !== "text") {
    document.transact(() => range.blocks.forEach((block) => document.removeBlock(block.id)));
    selection.clear();
    return payload;
  }
  pastePlainText(document, selection, current, "paragraph", "");
  return payload;
}

/** Converts interoperable HTML clipboard data to visible plain text. */
export function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}
