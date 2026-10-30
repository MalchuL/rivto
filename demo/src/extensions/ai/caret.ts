/**
 * Caret helpers for ghost text and Tab acceptance.
 *
 * Offsets are plain-text character counts, matching the contenteditable the
 * writing block stores as Markdown source while it is focused.
 *
 * @module
 */

import { BLOCK_CONTENT_ATTRIBUTE, BLOCK_ID_ATTRIBUTE } from "@chulane/rivto-react";

/** Caret location inside one focused block. */
export interface CaretPlace {
  readonly blockId: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly offset: number;
}

/** Screen box and font of the live caret, used to pin the ghost text. */
export interface CaretBox {
  readonly left: number;
  readonly top: number;
  readonly font: string;
  readonly lineHeight: string;
}

/**
 * Reads a collapsed caret in the focused block editor.
 *
 * @param root - Active editor surface.
 * @returns The place, or null when focus is not a collapsed block caret.
 */
export function readCaretPlace(root: HTMLElement): CaretPlace | null {
  const active = root.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (!active.hasAttribute(BLOCK_CONTENT_ATTRIBUTE)) return null;
  const blockId = active.closest(`[${BLOCK_ID_ATTRIBUTE}]`)?.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!blockId) return null;
  const offset = caretOffset(active);
  if (offset === undefined) return null;
  const content = active.textContent ?? "";
  return {
    blockId,
    prefix: content.slice(0, offset),
    suffix: content.slice(offset),
    offset,
  };
}

/**
 * Measures the caret so ghost text can sit on the same baseline.
 *
 * @param root - Active editor surface.
 * @param blockId - Block that owns the suggestion.
 * @returns Viewport position and font, or null when the caret is not measurable.
 */
export function measureCaret(root: HTMLElement, blockId: string): CaretBox | null {
  const content = findContent(root, blockId);
  const selection = content?.ownerDocument.getSelection();
  if (!content || !selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (!rect.height && !rect.width) return null;
  const style = content.ownerDocument.defaultView?.getComputedStyle(content);
  return {
    left: rect.left,
    top: rect.top,
    font: style?.font ?? "",
    lineHeight: style?.lineHeight ?? "",
  };
}

/**
 * Places the caret at a plain-text offset after a suggestion is inserted.
 *
 * @param root - Active editor surface.
 * @param blockId - Block that received the text.
 * @param offset - Character offset from the start of that block's content.
 * @returns Nothing.
 */
export function setCaretOffset(root: HTMLElement, blockId: string, offset: number): void {
  const content = findContent(root, blockId);
  const selection = content?.ownerDocument.getSelection();
  if (!content || !selection) return;
  const point = pointAt(content, offset);
  if (!point) return;
  content.focus({ preventScroll: true });
  selection.setBaseAndExtent(point[0], point[1], point[0], point[1]);
}

/** @returns The editable element for one block, if it is mounted. */
function findContent(root: HTMLElement, blockId: string): HTMLElement | null {
  const block = root.querySelector(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`);
  return block?.querySelector<HTMLElement>(`[${BLOCK_CONTENT_ATTRIBUTE}]`) ?? null;
}

/**
 * Reads a collapsed caret as a plain-text offset.
 *
 * @param content - Editable element that owns the selection.
 * @returns The offset, or undefined when the selection is outside `content`.
 */
export function caretOffset(content: HTMLElement): number | undefined {
  const selection = content.ownerDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !selection.focusNode) return;
  if (!content.contains(selection.focusNode)) return;
  const range = content.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(selection.focusNode, selection.focusOffset);
  } catch {
    return;
  }
  return range.toString().length;
}

/** @returns The text node and offset that land on `offset`, or null past the end. */
function pointAt(root: HTMLElement, offset: number): [Node, number] | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  let last: Node | null = null;
  while (node) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return [node, remaining];
    remaining -= length;
    node = walker.nextNode();
  }
  if (!last) return null;
  return [last, last.textContent?.length ?? 0];
}
