import type { EditorPosition, EditorSelection, TextSelection } from "../../../editor";
import { RIVTO_BLOCK_ATTR } from "../blocks/dom";
import {
  RIVTO_BLOCK_CONTENT_SELECTOR,
  RIVTO_BLOCK_SELECTOR,
  RIVTO_CROSS_SELECTED_ATTR,
  RIVTO_CROSS_SELECTION_HIGHLIGHT,
} from "./constants";

/** Native DOM endpoint used while extending or restoring text selection. */
export interface DOMSelectionPoint {
  /** Text or element node accepted by Selection.setBaseAndExtent. */
  node: Node;
  /** DOM offset within the endpoint node. */
  offset: number;
  /** Editable block-content host containing the endpoint. */
  content: HTMLElement;
}

/** Viewport rectangle produced by a block/object selection gesture. */
export interface SelectionRect {
  /** Left viewport edge. */
  left: number;
  /** Top viewport edge. */
  top: number;
  /** Rectangle width. */
  width: number;
  /** Rectangle height. */
  height: number;
}

/** Returns the distance from a point to the nearest point inside a rectangle. */
function distanceToRect(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/** Finds the text host under the pointer or the nearest host outside block gaps. */
function contentNearPoint(root: HTMLElement, x: number, y: number): HTMLElement | undefined {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR);
  if (hit && root.contains(hit)) return hit;
  return [...root.querySelectorAll<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR)]
    .map((content) => ({ content, distance: distanceToRect(content.getBoundingClientRect(), x, y) }))
    .sort((a, b) => a.distance - b.distance)[0]?.content;
}

/**
 * Finds the text caret nearest viewport coordinates inside a known content host.
 *
 * This fallback is used when the browser caret hit-test is constrained to the
 * currently active contenteditable. It scans one block, not the whole document.
 */
function nearestTextPoint(content: HTMLElement, x: number, y: number): DOMSelectionPoint {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
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
 * Finds a selectable text position at viewport coordinates inside one editor.
 *
 * Firefox exposes `caretPositionFromPoint`; Chromium exposes the older Range
 * form. Supporting both keeps pointer selection adapter-free.
 */
export function readDOMSelectionPoint(root: HTMLElement, x: number, y: number): DOMSelectionPoint | undefined {
  const hit = contentNearPoint(root, x, y);
  if (!hit) return;
  const caret = document.caretPositionFromPoint?.(x, y);
  const fallback = (document as Document & { caretRangeFromPoint?: (left: number, top: number) => Range | null })
    .caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? fallback?.startContainer;
  const offset = caret?.offset ?? fallback?.startOffset;
  if (node && offset !== undefined && hit.contains(node)) return { node, offset, content: hit };
  return nearestTextPoint(hit, x, y);
}

/**
 * Maps one DOM selection endpoint to a block-relative UTF-16 text position.
 *
 * @returns Portable editor position, or undefined outside editable content.
 */
function readPosition(root: HTMLElement, node: Node | null, offset: number): EditorPosition | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const content = element?.closest<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR);
  const block = content?.closest<HTMLElement>(RIVTO_BLOCK_SELECTOR);
  const blockId = block?.getAttribute(RIVTO_BLOCK_ATTR);
  if (!node || !content || !blockId || !root.contains(content)) return;
  const range = document.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(node, offset);
  } catch {
    return;
  }
  return { blockId, offset: range.toString().length };
}

/**
 * Reads the browser's directed selection when both endpoints belong to Rivto.
 *
 * Each endpoint is resolved independently, allowing selections to cross block
 * and nested contenteditable boundaries while preserving anchor/head direction.
 */
export function readEditorSelection(root: HTMLElement): TextSelection | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const anchor = readPosition(root, selection.anchorNode, selection.anchorOffset);
  const head = readPosition(root, selection.focusNode, selection.focusOffset);
  return anchor && head ? { type: "text", anchor, head } : undefined;
}

/**
 * Converts a pointer-selection endpoint into portable editor coordinates.
 *
 * Reading the resolved endpoint directly avoids waiting for asynchronous
 * `selectionchange` and preserves bottom-up gesture direction.
 */
export function readDOMPointPosition(root: HTMLElement, point: DOMSelectionPoint): EditorPosition | undefined {
  return readPosition(root, point.node, point.offset);
}

/** Resolves a UTF-16 text offset to a live DOM Range endpoint. */
function pointAtOffset(content: HTMLElement, requestedOffset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, requestedOffset);
  let last: Node | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return last ? { node: last, offset: last.textContent?.length ?? 0 } : { node: content, offset: 0 };
}

/** Finds one editable content host without interpolating arbitrary block IDs. */
function contentForBlock(root: HTMLElement, blockId: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(RIVTO_BLOCK_SELECTOR)]
    .find((block) => block.getAttribute(RIVTO_BLOCK_ATTR) === blockId)
    ?.querySelector<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR) ?? undefined;
}

/**
 * Extends the browser selection between endpoints in separate contenteditables.
 *
 * `setBaseAndExtent` retains gesture direction. Range normalizes endpoints,
 * which makes upward selections look forward to later keyboard extension.
 */
export function setNativeSelection(anchor: DOMSelectionPoint, head: DOMSelectionPoint): void {
  const selection = window.getSelection();
  if (!selection) return;
  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    return;
  } catch {
    // Detached or browser-rejected cross-editable endpoints fall through.
  }
  const anchorBeforeHead = anchor.node === head.node
    ? anchor.offset <= head.offset
    : Boolean(anchor.node.compareDocumentPosition(head.node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const start = anchorBeforeHead ? anchor : head;
  const end = anchorBeforeHead ? head : anchor;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Clears a native range only when one of its endpoints belongs to this editor. */
export function clearNativeSelection(root: HTMLElement): void {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const head = selection?.focusNode;
  if (!selection || (!anchor && !head)) return;
  if ((anchor && root.contains(anchor)) || (head && root.contains(head))) selection.removeAllRanges();
}

/**
 * Restores portable editor selection after React synchronizes editable DOM.
 *
 * Collapsed ranges focus their owning editing host only while focus is already
 * inside this editor, so toolbar clicks do not steal focus back.
 */
export function restoreEditorSelection(root: HTMLElement, selection: EditorSelection | null): void {
  if (!selection || selection.type !== "text") return;
  const anchorContent = contentForBlock(root, selection.anchor.blockId);
  const headContent = contentForBlock(root, selection.head.blockId);
  if (!anchorContent || !headContent) return;
  const collapsed = selection.anchor.blockId === selection.head.blockId && selection.anchor.offset === selection.head.offset;
  const activeContent = document.activeElement instanceof HTMLElement
    ? document.activeElement.closest<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR)
    : null;
  if (collapsed && (!activeContent || !root.contains(activeContent))) return;
  if (collapsed && activeContent !== headContent) headContent.focus({ preventScroll: true });
  const anchor = pointAtOffset(anchorContent, selection.anchor.offset);
  const head = pointAtOffset(headContent, selection.head.offset);
  setNativeSelection(
    { ...anchor, content: anchorContent },
    { ...head, content: headContent },
  );
}

/** Removes Rivto's supplemental cross-editing-host selection paint. */
export function clearCrossBlockHighlight(root: HTMLElement): void {
  const cssWithHighlights = CSS as unknown as { highlights?: { delete(name: string): void } };
  cssWithHighlights.highlights?.delete(RIVTO_CROSS_SELECTION_HIGHLIGHT);
  root.querySelectorAll<HTMLElement>(`[${RIVTO_CROSS_SELECTED_ATTR}]`).forEach((element) => {
    element.removeAttribute(RIVTO_CROSS_SELECTED_ATTR);
  });
}

/**
 * Paints portions of a selection that native multi-host highlighting omits.
 *
 * Browsers maintain only one native selection range across independent
 * contenteditables and may paint just the active host. CSS Highlights add the
 * missing visual ranges without inserting marker nodes into editable content.
 */
export function updateCrossBlockHighlight(root: HTMLElement, selection: EditorSelection | null): void {
  clearCrossBlockHighlight(root);
  if (!selection || selection.type !== "text" || selection.anchor.blockId === selection.head.blockId) return;
  const contents = [...root.querySelectorAll<HTMLElement>(RIVTO_BLOCK_CONTENT_SELECTOR)];
  const blockId = (content: HTMLElement): string | undefined =>
    content.closest<HTMLElement>(RIVTO_BLOCK_SELECTOR)?.getAttribute(RIVTO_BLOCK_ATTR) ?? undefined;
  const anchorIndex = contents.findIndex((content) => blockId(content) === selection.anchor.blockId);
  const headIndex = contents.findIndex((content) => blockId(content) === selection.head.blockId);
  if (anchorIndex < 0 || headIndex < 0) return;
  const forward = anchorIndex < headIndex;
  const firstIndex = Math.min(anchorIndex, headIndex);
  const lastIndex = Math.max(anchorIndex, headIndex);
  const firstOffset = forward ? selection.anchor.offset : selection.head.offset;
  const lastOffset = forward ? selection.head.offset : selection.anchor.offset;
  const ranges: Range[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const content = contents[index];
    const start = pointAtOffset(content, index === firstIndex ? firstOffset : 0);
    const end = pointAtOffset(content, index === lastIndex ? lastOffset : content.textContent?.length ?? 0);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  const highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  const cssWithHighlights = CSS as unknown as { highlights?: { set(name: string, value: unknown): void } };
  if (cssWithHighlights.highlights && highlight) {
    cssWithHighlights.highlights.set(RIVTO_CROSS_SELECTION_HIGHLIGHT, new highlight(...ranges));
  } else {
    contents.slice(firstIndex, lastIndex + 1).forEach((content) => {
      content.setAttribute(RIVTO_CROSS_SELECTED_ATTR, "true");
    });
  }
}

/** Tests strict rectangle intersection; touching edges alone does not select. */
function intersects(a: SelectionRect, b: DOMRect): boolean {
  return a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;
}

/** Tests whether a block fully contains the user's selection rectangle vertically. */
function containsVertically(block: DOMRect, selection: SelectionRect): boolean {
  return block.top <= selection.top && block.bottom >= selection.top + selection.height;
}

/**
 * Resolves a blank-area rectangle selection into visible document-order block IDs.
 *
 * This follows BlockSuite's useful parent rule: if a gesture is contained in
 * one parent, select a contiguous run of direct children when possible;
 * otherwise intersecting ancestors win and selected descendants are removed.
 */
export function blockIdsInRect(root: HTMLElement, selection: SelectionRect): string[] {
  const blocks = [...root.querySelectorAll<HTMLElement>(RIVTO_BLOCK_SELECTOR)]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.top <= selection.top + selection.height);
  if (!blocks.length) return [];
  const containing = blocks.filter(({ rect }) => intersects(selection, rect) && containsVertically(rect, selection)).at(-1);
  let selected = blocks.filter(({ rect }) => intersects(selection, rect));
  if (containing) {
    const children = blocks.filter(({ element }) =>
      element.parentElement?.closest<HTMLElement>(RIVTO_BLOCK_SELECTOR) === containing.element);
    const first = children.findIndex(({ rect }) => intersects(selection, rect) && rect.top < selection.top);
    const last = children.findIndex(({ rect }) => intersects(selection, rect) && rect.bottom > selection.top + selection.height);
    selected = first >= 0 && last >= 0 ? children.slice(first, last + 1) : [containing];
  }
  const selectedElements = new Set(selected.map(({ element }) => element));
  return selected.flatMap(({ element }) => {
    const parent = element.parentElement?.closest<HTMLElement>(RIVTO_BLOCK_SELECTOR);
    const id = element.getAttribute(RIVTO_BLOCK_ATTR);
    return id && (!parent || !selectedElements.has(parent)) ? [id] : [];
  });
}
