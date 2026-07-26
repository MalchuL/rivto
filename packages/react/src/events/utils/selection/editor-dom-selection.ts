import type {
  EditorPosition,
  EditorSelection,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  TEXT_SELECTED_SELECTOR,
} from "../../../constants";

/** Native DOM endpoint used while a pointer crosses editable block hosts. */
export interface DOMSelectionPoint {
  /** Text or element node accepted by Selection.setBaseAndExtent. */
  readonly node: Node;
  /** DOM offset within `node`. */
  readonly offset: number;
  /** Editable block-content element that owns the endpoint. */
  readonly content: HTMLElement;
}

/** Minimal visible-block data needed to decompose a cross-block selection. */
export interface SelectionBlock {
  /** Stable block identity in visible document order. */
  readonly id: string;
  /** Current plain-text length in UTF-16 code units. */
  readonly length: number;
}

/** Name used by surfaces that style the supplemental CSS Highlight range. */
export const TEXT_SELECTION_HIGHLIGHT_NAME = "rivto-text-selection";

/** Reads the stable block ID that owns one editable content element. */
function blockIdForContent(content: HTMLElement): string | undefined {
  return content.closest<HTMLElement>(BLOCK_ID_SELECTOR)?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined;
}

/** Returns editable content elements in the surface's visible DOM order. */
function orderedContents(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)].filter((content) => (
    Boolean(blockIdForContent(content))
  ));
}

/**
 * Builds portable selection items from two directed editor positions.
 *
 * The text item retains the real pointer direction and exact boundary offsets.
 * Blocks strictly between those endpoints are fully covered, so a second block
 * item records them explicitly. `blockIds` stay in document order while its
 * anchor/focus preserve whether the gesture moved top-down or bottom-up.
 *
 * @param blocks - Visible editable blocks in document order.
 * @param anchor - Fixed position where the gesture began.
 * @param head - Moving position where the gesture currently ends.
 * @returns One directed text item and, when needed, one middle-block item.
 */
export function createSelectionItems(
  blocks: readonly SelectionBlock[],
  anchor: EditorPosition,
  head: EditorPosition,
): EditorSelection {
  const text = { type: "text", anchor: { ...anchor }, head: { ...head } } as const;
  const anchorIndex = blocks.findIndex((block) => block.id === anchor.blockId);
  const headIndex = blocks.findIndex((block) => block.id === head.blockId);
  if (anchorIndex < 0 || headIndex < 0 || anchorIndex === headIndex) return [text];

  const first = Math.min(anchorIndex, headIndex) + 1;
  const last = Math.max(anchorIndex, headIndex);
  const blockIds = blocks.slice(first, last).map((block) => block.id);
  if (!blockIds.length) return [text];

  const forward = anchorIndex < headIndex;
  return [
    text,
    {
      type: "block",
      blockIds,
      anchorBlockId: forward ? blockIds[0]! : blockIds.at(-1)!,
      focusBlockId: forward ? blockIds.at(-1)! : blockIds[0]!,
    },
  ];
}

/**
 * Creates one inclusive whole-block range in visible order.
 *
 * Unlike a text range, both endpoint blocks are complete selections. The ID
 * array remains top-down while anchor/focus retain gesture direction.
 */
export function createBlockSelection(
  blockIds: readonly string[],
  anchorBlockId: string,
  focusBlockId: string,
): EditorSelection {
  const anchorIndex = blockIds.indexOf(anchorBlockId);
  const focusIndex = blockIds.indexOf(focusBlockId);
  if (anchorIndex < 0 || focusIndex < 0) return [];
  return [{
    type: "block",
    blockIds: blockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1),
    anchorBlockId,
    focusBlockId,
  }];
}

/** Returns every rendered BlockView ID in visible depth-first DOM order. */
export function orderedBlockIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)].flatMap((block) => {
    const blockId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    return blockId ? [blockId] : [];
  });
}

/** Maps one DOM endpoint to a block-relative plain-text offset. */
function readPosition(root: HTMLElement, node: Node | null, offset: number): EditorPosition | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const content = element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  const blockId = content ? blockIdForContent(content) : undefined;
  if (!node || !content || !blockId || !root.contains(content)) return;

  const range = root.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(node, offset);
  } catch {
    // Browsers can expose a transient endpoint whose node was just rerendered.
    return;
  }
  return { blockId, offset: range.toString().length };
}

/** Converts one resolved DOM point to stable editor coordinates. */
export function readDOMPointPosition(root: HTMLElement, point: DOMSelectionPoint): EditorPosition | undefined {
  return readPosition(root, point.node, point.offset);
}

/** Converts two stable positions using the surface's current visible order. */
export function createDOMSelectionItems(
  root: HTMLElement,
  anchor: EditorPosition,
  head: EditorPosition,
): EditorSelection {
  const blocks = orderedContents(root).flatMap((content) => {
    const id = blockIdForContent(content);
    return id ? [{ id, length: content.textContent?.length ?? 0 }] : [];
  });
  return createSelectionItems(blocks, anchor, head);
}

/**
 * Reads the browser selection when both endpoints belong to this editor root.
 *
 * Anchor and focus are read independently instead of using Range start/end.
 * Range normalizes its endpoints into document order and would lose the
 * direction of a bottom-to-top selection.
 */
export function readEditorDOMSelection(root: HTMLElement): EditorSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  const anchor = readPosition(root, selection.anchorNode, selection.anchorOffset);
  const head = readPosition(root, selection.focusNode, selection.focusOffset);
  return anchor && head ? createDOMSelectionItems(root, anchor, head) : undefined;
}

/** Calculates pointer distance from the nearest point inside a rectangle. */
function distanceToRect(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/** Finds editable content under the pointer or nearest to a block gap. */
function contentNearPoint(root: HTMLElement, x: number, y: number): HTMLElement | undefined {
  const hit = root.ownerDocument.elementFromPoint(x, y)?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  if (hit && root.contains(hit)) return hit;
  return orderedContents(root)
    .map((content) => ({ content, distance: distanceToRect(content.getBoundingClientRect(), x, y) }))
    .sort((left, right) => left.distance - right.distance)[0]?.content;
}

/** Finds a caret by scanning one content element when browser hit-testing fails. */
function nearestTextPoint(content: HTMLElement, x: number, y: number): DOMSelectionPoint {
  const document = content.ownerDocument;
  const walker = document.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
  let best: DOMSelectionPoint | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let offset = 0; offset <= text.length; offset += 1) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const distance = Math.hypot(x - rect.left, y - (rect.top + rect.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { node, offset, content };
      }
    }
  }
  return best ?? { node: content, offset: 0, content };
}

/**
 * Resolves the nearest selectable DOM endpoint at viewport coordinates.
 *
 * Firefox exposes `caretPositionFromPoint`; Chromium exposes the older Range
 * API. The local text scan is a fallback for browsers that constrain hit tests
 * to the currently focused contenteditable.
 */
export function readDOMSelectionPoint(root: HTMLElement, x: number, y: number): DOMSelectionPoint | undefined {
  const content = contentNearPoint(root, x, y);
  if (!content) return;
  const document = root.ownerDocument;
  const caret = document.caretPositionFromPoint?.(x, y);
  const fallback = (document as Document & { caretRangeFromPoint?: (left: number, top: number) => Range | null })
    .caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? fallback?.startContainer;
  const offset = caret?.offset ?? fallback?.startOffset;
  if (node && offset !== undefined && content.contains(node)) return { node, offset, content };
  return nearestTextPoint(content, x, y);
}

/**
 * Displays a directed native selection across separate contenteditable hosts.
 *
 * `setBaseAndExtent` preserves upward selection direction. The Range fallback
 * still displays a normalized range when a browser rejects cross-host native
 * endpoints; the editor selection list remains the source of direction.
 */
export function setNativeSelection(anchor: DOMSelectionPoint, head: DOMSelectionPoint): void {
  const selection = anchor.content.ownerDocument.getSelection();
  if (!selection) return;
  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    return;
  } catch {
    // Fall through to a normalized Range for detached/browser-rejected points.
  }

  const anchorBeforeHead = anchor.node === head.node
    ? anchor.offset <= head.offset
    : Boolean(anchor.node.compareDocumentPosition(head.node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const start = anchorBeforeHead ? anchor : head;
  const end = anchorBeforeHead ? head : anchor;
  const range = anchor.content.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Resolves a plain-text offset back to a live DOM endpoint. */
function pointAtOffset(content: HTMLElement, requestedOffset: number): { node: Node; offset: number } {
  const walker = content.ownerDocument.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
  let remaining = Math.max(0, requestedOffset);
  let last: Node | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return last
    ? { node: last, offset: last.textContent?.length ?? 0 }
    : { node: content, offset: 0 };
}

/** Resolves one portable editor position to its current live DOM endpoint. */
export function resolveDOMSelectionPoint(root: HTMLElement, position: EditorPosition): DOMSelectionPoint | undefined {
  const content = orderedContents(root).find((candidate) => blockIdForContent(candidate) === position.blockId);
  return content ? { ...pointAtOffset(content, position.offset), content } : undefined;
}

/**
 * Restores the browser range represented by an editor text selection.
 *
 * Structural commands can preserve block IDs and text offsets while React
 * reparents their DOM elements. The browser range still points at the detached
 * nodes and is commonly cleared. This helper resolves both stored endpoints
 * against the newly rendered content elements, focuses the moving endpoint,
 * and recreates the directed native selection. Supplemental cross-block
 * highlighting is repainted at the same time.
 *
 * Block-only and edgeless selections have no native text range, so they return
 * false without changing focus. Missing rendered endpoints also return false;
 * callers can safely retry after a later render.
 *
 * @param root - Active EditorView root containing the rendered block content.
 * @param selection - Editor selection captured before the structural command.
 * @returns True when a text selection was resolved and restored.
 */
export function restoreEditorDOMSelection(root: HTMLElement, selection: EditorSelection): boolean {
  const text = selection.find((item) => item.type === "text");
  if (!text) return false;

  const contents = orderedContents(root);
  const anchorContent = contents.find((content) => blockIdForContent(content) === text.anchor.blockId);
  const headContent = contents.find((content) => blockIdForContent(content) === text.head.blockId);
  if (!anchorContent || !headContent) return false;

  const anchor = pointAtOffset(anchorContent, text.anchor.offset);
  const head = pointAtOffset(headContent, text.head.offset);
  headContent.focus({ preventScroll: true });
  setNativeSelection(
    { ...anchor, content: anchorContent },
    { ...head, content: headContent },
  );
  updateTextSelectionHighlight(root, selection);
  return true;
}

/** Removes supplemental selection ranges and fallback element markers. */
export function clearTextSelectionHighlight(root: HTMLElement): void {
  if ("highlights" in CSS) CSS.highlights.delete(TEXT_SELECTION_HIGHLIGHT_NAME);
  root.querySelectorAll<HTMLElement>(TEXT_SELECTED_SELECTOR).forEach((content) => {
    delete content.dataset.textSelected;
  });
}

/**
 * Paints cross-contenteditable text that browsers may omit from native paint.
 *
 * CSS Highlights preserve exact partial boundary ranges. The data-attribute
 * fallback marks touched content elements for older engines; surfaces decide
 * how either marker looks and the library remains UI-style agnostic.
 */
export function updateTextSelectionHighlight(root: HTMLElement, selection: EditorSelection): void {
  clearTextSelectionHighlight(root);
  const text = selection.find((item) => item.type === "text");
  if (!text || text.anchor.blockId === text.head.blockId) return;

  const contents = orderedContents(root);
  const anchorIndex = contents.findIndex((content) => blockIdForContent(content) === text.anchor.blockId);
  const headIndex = contents.findIndex((content) => blockIdForContent(content) === text.head.blockId);
  if (anchorIndex < 0 || headIndex < 0) return;

  const forward = anchorIndex < headIndex;
  const firstIndex = Math.min(anchorIndex, headIndex);
  const lastIndex = Math.max(anchorIndex, headIndex);
  const firstOffset = forward ? text.anchor.offset : text.head.offset;
  const lastOffset = forward ? text.head.offset : text.anchor.offset;
  const ranges: Range[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const content = contents[index]!;
    const start = pointAtOffset(content, index === firstIndex ? firstOffset : 0);
    const end = pointAtOffset(content, index === lastIndex ? lastOffset : content.textContent?.length ?? 0);
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }

  if ("highlights" in CSS && typeof Highlight !== "undefined") {
    CSS.highlights.set(TEXT_SELECTION_HIGHLIGHT_NAME, new Highlight(...ranges));
  } else {
    contents.slice(firstIndex, lastIndex + 1).forEach((content) => {
      content.dataset.textSelected = "true";
    });
  }
}
