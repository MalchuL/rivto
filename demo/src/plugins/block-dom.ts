import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_SELECTOR,
} from "@chulane/rivto";

/** DOM elements and persisted identity resolved from an editor event target. */
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
 * @param event - Native event received by useEditorEvent.
 * @returns Editable content, its BlockView element, and persisted block ID.
 */
export function findBlockFromEvent(event: Event): EventBlock | null {
  if (!(event.target instanceof Element)) return null;

  const content = event.target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  const block = content?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
  const blockId = block?.dataset.blockId;

  return content && block && blockId ? { block, content, blockId } : null;
}

/**
 * Reads a collapsed browser caret as a plain-text offset inside editable content.
 *
 * DOM selections store a node and an offset within that node. Editor commands
 * need one offset within the complete block string, so a temporary Range measures
 * all text between the start of the content element and the caret. Expanded or
 * cross-block selections return null because splitting them requires replacement
 * semantics rather than the simple Enter behavior implemented today.
 *
 * @param content - Block content element containing the expected caret.
 * @returns Zero-based text offset, or null when there is no collapsed caret.
 */
export function getCaretOffset(content: HTMLElement): number | null {
  const selection = content.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.focusNode) return null;
  if (!content.contains(selection.focusNode)) return null;

  const range = content.ownerDocument.createRange();
  range.selectNodeContents(content);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return range.toString().length;
}

/** Finds a rendered BlockView by ID without interpolating that ID into CSS. */
function findBlock(root: HTMLElement, blockId: string): HTMLElement | null {
  for (const block of root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)) {
    if (block.dataset.blockId === blockId) return block;
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
 * visible traversal. A non-editable divider or attachment stops the lookup so
 * Backspace never merges text across structural content.
 *
 * @param root - Active page surface root.
 * @param blockId - Current block whose predecessor is requested.
 * @returns Previous editable block identity and elements, or null.
 */
export function findPreviousEditableBlock(root: HTMLElement, blockId: string): EventBlock | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR));
  const index = blocks.findIndex((block) => block.dataset.blockId === blockId);
  if (index <= 0) return null;

  const block = blocks[index - 1];
  const content = findOwnedContent(block);
  const previousId = block.dataset.blockId;
  return content && previousId ? { block, content, blockId: previousId } : null;
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
  const block = findBlock(root, blockId);
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
