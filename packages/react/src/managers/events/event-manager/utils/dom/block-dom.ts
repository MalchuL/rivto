import type { EditorPosition } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../../../../constants";

/** DOM elements and persisted identity resolved from a delegated event target. */
export interface EventBlock {
  /** Stable BlockView container carrying block identity and type markers. */
  readonly block: HTMLElement;
  /** Plain-text contentEditable element inside the block container. */
  readonly content: HTMLElement;
  /** Persisted ID read from BlockView's `data-block-id` attribute. */
  readonly blockId: string;
}

/**
 * Finds the editable block containing a browser event's original target.
 *
 * Delegated events arrive at the PageSurface root after bubbling, while
 * `event.target` still identifies the deepest originating element. `closest`
 * walks upward first to the content marker and then to its BlockView marker.
 * Events outside editable content return null and remain available to buttons,
 * menus, and other controls.
 *
 * @param event - Native event received by `useDOMEvent`.
 * @returns Editable content, its BlockView element, and persisted block ID.
 */
export function findBlockFromEvent(event: Event): EventBlock | null {
  if (!(event.target instanceof Element)) return null;

  const content = event.target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  const block = content?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
  const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);

  return content && block && blockId ? { block, content, blockId } : null;
}

/** Finds a rendered BlockView by ID without interpolating that ID into CSS. */
export function findRenderedBlock(root: HTMLElement, blockId: string): HTMLElement | null {
  for (const block of root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)) {
    if (block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId) return block;
  }
  return null;
}

/** Finds editable content owned directly by one BlockView, excluding descendants. */
function findOwnedContent(block: HTMLElement): HTMLElement | null {
  for (const content of block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)) {
    if (content.closest(BLOCK_ID_SELECTOR) === block) return content;
  }
  return null;
}

/**
 * Finds the immediately previous rendered block when that block is editable.
 *
 * BlockView elements are returned in depth-first DOM order, matching the page's
 * visible traversal. A contentless custom block stops the lookup so Backspace
 * never merges text across structural controls.
 *
 * @param root - Active page surface root.
 * @param blockId - Current block whose predecessor is requested.
 * @returns Previous editable block identity and elements, or null.
 */
export function findPreviousEditableBlock(root: HTMLElement, blockId: string): EventBlock | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR));
  const index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  if (index <= 0) return null;

  const block = blocks[index - 1];
  const content = findOwnedContent(block);
  const previousId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
  return content && previousId ? { block, content, blockId: previousId } : null;
}

/** Finds the immediately next rendered block when that block is editable. */
export function findNextEditableBlock(root: HTMLElement, blockId: string): EventBlock | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR));
  const index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  if (index < 0 || index >= blocks.length - 1) return null;

  const block = blocks[index + 1];
  const content = findOwnedContent(block);
  const nextId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
  return content && nextId ? { block, content, blockId: nextId } : null;
}

/**
 * Finds the nearest ancestor BlockView of a rendered block.
 *
 * @param block - Current BlockView element.
 * @returns Parent BlockView, or null when the block is at the surface root.
 */
export function findParentBlock(block: HTMLElement): HTMLElement | null {
  return block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
}

/**
 * Focuses a rendered block and places a collapsed caret at a text offset.
 *
 * TreeWalker converts the editor's flat string offset back into a DOM text node
 * and node-relative offset. The requested position is clamped by falling back
 * to the end of the content, which keeps focus restoration safe after concurrent
 * text changes. Empty blocks place the caret directly in their content element.
 *
 * @param root - Active surface root containing the rendered block.
 * @param blockId - Persisted ID of the block to focus.
 * @param offset - Requested plain-text caret offset.
 * @returns True when the block and editable content were found.
 */
export function focusBlock(root: HTMLElement, blockId: string, offset: number): boolean {
  const block = findRenderedBlock(root, blockId);
  const content = block ? findOwnedContent(block) : null;
  if (!content) return false;

  content.focus();
  const selection = content.ownerDocument.getSelection();
  if (!selection) return true;

  const range = content.ownerDocument.createRange();
  const walker = content.ownerDocument.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
  let remaining = Math.max(0, offset);
  let textNode = walker.nextNode();
  let placed = false;

  while (textNode) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(textNode, remaining);
      range.collapse(true);
      placed = true;
      break;
    }
    remaining -= length;
    textNode = walker.nextNode();
  }

  if (!placed) {
    range.selectNodeContents(content);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** One block-relative caret candidate measured from the rendered DOM. */
interface CaretCandidate {
  readonly offset: number;
  readonly left: number;
  readonly top: number;
}

/** Resolves a flat UTF-16 text offset to a live DOM text endpoint. */
function textPoint(content: HTMLElement, requestedOffset: number): { node: Node; offset: number } {
  const walker = content.ownerDocument.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
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

/** Measures a collapsed caret, falling back to an adjacent character box. */
function caretCandidate(content: HTMLElement, offset: number): CaretCandidate {
  const length = content.textContent?.length ?? 0;
  const safeOffset = Math.max(0, Math.min(offset, length));
  const point = textPoint(content, safeOffset);
  const range = content.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  let rect = range.getBoundingClientRect();
  if (!rect.height && length) {
    const fromPrevious = safeOffset === length;
    const start = textPoint(content, fromPrevious ? safeOffset - 1 : safeOffset);
    const end = textPoint(content, fromPrevious ? safeOffset : safeOffset + 1);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    rect = range.getBoundingClientRect();
    return { offset: safeOffset, left: fromPrevious ? rect.right : rect.left, top: rect.top };
  }
  const contentRect = content.getBoundingClientRect();
  return { offset: safeOffset, left: rect.left || contentRect.left, top: rect.top || contentRect.top };
}

/** Groups measured character positions into rendered visual lines. */
function caretLines(content: HTMLElement): CaretCandidate[][] {
  const length = content.textContent?.length ?? 0;
  const lines: CaretCandidate[][] = [];
  for (let offset = 0; offset <= length; offset += 1) {
    const candidate = caretCandidate(content, offset);
    const line = lines.find((items) => Math.abs(items[0]!.top - candidate.top) < 2);
    if (line) line.push(candidate);
    else lines.push([candidate]);
  }
  return lines.sort((left, right) => left[0]!.top - right[0]!.top);
}

/** Chooses the character on one visual line nearest a viewport x-coordinate. */
function closestOnLine(line: CaretCandidate[], x: number): CaretCandidate {
  return line.reduce((closest, candidate) => (
    Math.abs(candidate.left - x) < Math.abs(closest.left - x) ? candidate : closest
  ));
}

/**
 * Resolves Up/Down using rendered lines rather than newline characters.
 *
 * Soft wrapping does not exist in the block's stored string, so the only
 * reliable source is DOM geometry. The scan is linear in block text length;
 * page blocks are intentionally short, and a cached layout index can replace
 * it later if profiling shows long code blocks need one.
 */
export function verticalCaretPosition(
  root: HTMLElement,
  position: EditorPosition,
  direction: "up" | "down",
): EditorPosition | undefined {
  const currentBlock = findRenderedBlock(root, position.blockId);
  const currentContent = currentBlock ? findOwnedContent(currentBlock) : null;
  if (!currentContent) return;
  const current = caretCandidate(currentContent, position.offset);
  const lines = caretLines(currentContent);
  const lineIndex = lines.reduce((best, line, index) => (
    Math.abs(line[0]!.top - current.top) < Math.abs(lines[best]![0]!.top - current.top) ? index : best
  ), 0);
  const nextLine = lines[lineIndex + (direction === "up" ? -1 : 1)];
  if (nextLine) return { blockId: position.blockId, offset: closestOnLine(nextLine, current.left).offset };

  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR));
  const currentIndex = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === position.blockId);
  for (
    let index = currentIndex + (direction === "up" ? -1 : 1);
    index >= 0 && index < blocks.length;
    index += direction === "up" ? -1 : 1
  ) {
    const content = findOwnedContent(blocks[index]!);
    const blockId = blocks[index]!.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!content || !blockId) continue;
    const targetLines = caretLines(content);
    const targetLine = direction === "up" ? targetLines.at(-1) : targetLines[0];
    return targetLine ? { blockId, offset: closestOnLine(targetLine, current.left).offset } : undefined;
  }
  return;
}
