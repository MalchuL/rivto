import type { Block, BlockInput, DocumentModelImpl, Link } from "../../store/document-model";
import type { EditorPosition, EditorSelection } from "../editor/types";

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

/** A directed editor selection normalized into visible document order. */
export interface NormalizedSelection {
  /**
   * Earlier block and UTF-16 offset, regardless of mouse-drag direction.
   * Mutation code retains this block as the destination of a replacement.
   */
  start: EditorPosition;
  /**
   * Later block and UTF-16 offset. Content after this point is the suffix that
   * must survive cut and paste operations.
   */
  end: EditorPosition;
  /**
   * Detached blocks touched by the range in visible depth-first order. The
   * first entry is retained during replacement; later entries are removed.
   */
  blocks: Block[];
}

/** Remapped clipboard values ready for cursor-aware insertion. */
export interface RemappedClipboardBundle {
  /** New sibling blocks after the consumed first block. */
  blocks: BlockInput[];
  /** New children that belonged to the consumed first block. */
  firstChildren: BlockInput[];
  /** Links with every copied endpoint remapped. */
  links: Link[];
}

/**
 * Flattens block trees in visible depth-first document order.
 *
 * @param blocks - Detached roots whose child order must be preserved.
 * @returns References from the supplied tree in visible traversal order.
 */
export function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/**
 * Creates a detached block tree so clipboard trimming never mutates a snapshot.
 *
 * @param block - Materialized source block to copy recursively.
 * @returns Detached block with copied maps, layout, and descendants.
 */
function cloneBlock(block: Block): Block {
  return {
    ...block,
    props: { ...block.props },
    pluginData: { ...block.pluginData },
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(cloneBlock),
  };
}

/**
 * Finds a block recursively inside a detached clipboard tree.
 *
 * @param blocks - Clipboard roots to search depth-first.
 * @param id - Stable source ID to locate.
 * @returns Matching detached block, or `undefined` when absent.
 */
function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

/**
 * Builds parent IDs used to avoid returning duplicate selected subtrees.
 *
 * @param blocks - Detached tree whose relationships should be indexed.
 * @param parents - Recursive accumulator owned by the outermost call.
 * @returns Child-to-parent IDs for every descendant.
 */
function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Normalizes a directed selection by visible block order and UTF-16 offsets.
 *
 * SelectionManager deliberately preserves anchor/head direction because UI
 * gestures need it. Clipboard mutations need a different invariant: `start`
 * must always be before `end`. This function is the single conversion point,
 * so copy, cut, structured paste, and plain-text paste cannot disagree about
 * which boundary is first when the user selects backwards.
 *
 * @param document - Source of detached ordered blocks.
 * @param selection - Directed local selection to normalize.
 * @returns Ordered endpoints and selected blocks, or `undefined` when invalid.
 */
export function normalizeSelection(document: DocumentModelImpl, selection: EditorSelection | null): NormalizedSelection | undefined {
  if (!selection) return;
  const all = flattenBlocks(document.document);
  if (selection.type !== "text") {
    const selected = new Set(selection.blockIds);
    const blocks = all.filter((block) => selected.has(block.id));
    const first = blocks[0];
    const last = blocks.at(-1);
    if (!first || !last) return;
    return {
      start: { blockId: first.id, offset: 0 },
      end: { blockId: last.id, offset: last.content.length },
      blocks,
    };
  }
  const anchorIndex = all.findIndex((block) => block.id === selection.anchor.blockId);
  const headIndex = all.findIndex((block) => block.id === selection.head.blockId);
  if (anchorIndex < 0 || headIndex < 0) return;
  const forward = anchorIndex < headIndex || (anchorIndex === headIndex && selection.anchor.offset <= selection.head.offset);
  const start = forward ? selection.anchor : selection.head;
  const end = forward ? selection.head : selection.anchor;
  const first = Math.min(anchorIndex, headIndex);
  const last = Math.max(anchorIndex, headIndex);
  return {
    start: { ...start },
    end: { ...end },
    blocks: all.slice(first, last + 1),
  };
}

/**
 * Selects top-level copied subtrees without duplicating selected descendants.
 *
 * @param document - Source of the complete ordered block tree.
 * @param range - Normalized visible selection range.
 * @returns Detached top-level clipboard subtrees.
 */
function copySelectedSubtrees(document: DocumentModelImpl, range: NormalizedSelection): Block[] {
  const tree = document.document;
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(tree);
  return range.blocks.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }).map(cloneBlock);
}

/**
 * Escapes plain block content before placing it into an HTML clipboard fallback.
 *
 * @param value - Plain Markdown source to encode as HTML text.
 * @returns Text safe to interpolate inside a clipboard paragraph.
 */
export function escapeClipboardHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

/**
 * Creates structured, HTML, and plain-text representations of an exact range.
 *
 * Boundary blocks retain their native data while their content is trimmed to
 * the selected UTF-16 offsets. Descendants remain structurally atomic.
 * For example, selecting `pha` from `Alpha` through `Be` from `Beta` produces
 * two typed structured blocks containing `pha` and `Be`, HTML paragraphs with
 * those same fragments, and plain text `pha\nBe`. Producing every MIME format
 * from this one detached slice prevents rich and plain paste from observing
 * different selections.
 *
 * The original document is never patched here. Clipboard serialization works
 * on clones because trimming a boundary is presentation of a selection, not a
 * collaborative document mutation.
 *
 * @param document - Source document and link collection.
 * @param selection - Directed local selection.
 * @returns All clipboard representations, or `undefined` for an invalid range.
 */
export function createClipboardPayload(document: DocumentModelImpl, selection: EditorSelection | null): ClipboardPayload | undefined {
  const range = normalizeSelection(document, selection);
  if (!range?.blocks.length) return;
  const blocks = copySelectedSubtrees(document, range);
  const start = findBlock(blocks, range.start.blockId);
  const end = findBlock(blocks, range.end.blockId);
  if (!start || !end) return;
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
    html: visible.map((block) => `<p>${escapeClipboardHtml(block.content)}</p>`).join(""),
    text: visible.map((block) => block.content).join("\n"),
  };
}

/**
 * Remaps copied identities, optionally consuming the first block into a target.
 *
 * Every newly inserted block receives a fresh ID to prevent collisions when a
 * bundle is pasted into its source document. When `firstTargetId` is supplied,
 * the first copied root is not inserted: its source ID maps to the existing
 * destination block instead. Consequently, links from the copied first block
 * now point to the destination while links to copied children and later blocks
 * point to their fresh IDs. This is what lets cursor paste keep the current
 * block type and still preserve graph relationships.
 *
 * @param bundle - Valid structured clipboard data.
 * @param firstTargetId - Existing target ID replacing the first copied root ID.
 * @returns Detached insertions, first-root children, and remapped links.
 * @throws If the clipboard bundle shape or version is unsupported.
 */
export function remapClipboardBundle(bundle: ClipboardBundle, firstTargetId?: string): RemappedClipboardBundle {
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
