import { BlockDOMSelection } from "@chulane/rivto-page";
import type { EditorPosition } from "@chulane/rivto";
import { BLOCK_CONTENT_SELECTOR, BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../constants";
import { PageNavigationController } from "../surfaces/page/page-navigation-controller";
import { PANEL_SELECTOR, findPanelElements, isInPanel } from "../panels/panel-dom";

/** DOM elements and persisted identity resolved from a delegated event target. */
export interface EventBlock {
  /** Stable block shell container carrying block identity and type markers. */
  readonly block: HTMLElement;
  /** Plain-text contentEditable element inside the block container. */
  readonly content: HTMLElement;
  /** Persisted ID read from block shell's `data-block-id` attribute. */
  readonly blockId: string;
}

/**
 * Finds the editable block containing a browser event's original target.
 *
 * Delegated events arrive at the PageSurface root after bubbling, while
 * `event.target` still identifies the deepest originating element. `closest`
 * walks upward first to the content marker and then to its block shell marker.
 * Events outside editable content return null and remain available to buttons,
 * menus, and other controls.
 *
 * @param event - Native event received by `useDOMEvent`.
 * @returns Editable content, its block shell element, and persisted block ID.
 */
export function findBlockFromEvent(event: Event): EventBlock | null {
  if (!(event.target instanceof Element)) {
    return null;
  }

  const content = event.target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  const block = content?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
  const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);

  return content && block && blockId ? { block, content, blockId } : null;
}

/** Finds a rendered block shell by ID without interpolating that ID into CSS. */
export function findRenderedBlock(root: HTMLElement, blockId: string): HTMLElement | null {
  for (const block of findPanelElements(root, BLOCK_ID_SELECTOR)) {
    if (block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId) {
      return block;
    }
  }
  return null;
}

/** Finds editable content owned directly by one block shell, excluding descendants. */
function findOwnedContent(block: HTMLElement): HTMLElement | null {
  for (const content of block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)) {
    if (content.closest(BLOCK_ID_SELECTOR) === block) {
      return content;
    }
  }
  return null;
}

/**
 * Finds the immediately previous rendered block when that block is editable.
 *
 * block shell elements are returned in depth-first DOM order, matching the page's
 * visible traversal. A contentless custom block stops the lookup so Backspace
 * never merges text across structural controls.
 *
 * @param root - Active page surface root.
 * @param blockId - Current block whose predecessor is requested.
 * @returns Previous editable block identity and elements, or null.
 */
export function findPreviousEditableBlock(root: HTMLElement, blockId: string): EventBlock | null {
  let blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
  let index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  if (index === 0 && PageNavigationController.getForElement(root)) {
    PageNavigationController.getForElement(root)?.mountAdjacentBlocks(blockId, -1);
    blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
    index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  }
  if (index <= 0) {
    return null;
  }

  const block = blocks[index - 1];
  const content = findOwnedContent(block);
  const previousId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
  return content && previousId ? { block, content, blockId: previousId } : null;
}

/** Finds the immediately next rendered block when that block is editable. */
export function findNextEditableBlock(root: HTMLElement, blockId: string): EventBlock | null {
  let blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
  let index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  if (index === blocks.length - 1 && PageNavigationController.getForElement(root)) {
    PageNavigationController.getForElement(root)?.mountAdjacentBlocks(blockId, 1);
    blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
    index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  }
  if (index < 0 || index >= blocks.length - 1) {
    return null;
  }

  const block = blocks[index + 1];
  const content = findOwnedContent(block);
  const nextId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
  return content && nextId ? { block, content, blockId: nextId } : null;
}

/**
 * Finds the nearest ancestor block shell of a rendered block.
 *
 * @param block - Current block shell element.
 * @returns Parent block shell, or null when the block is at the surface root.
 */
export function findParentBlock(block: HTMLElement): HTMLElement | null {
  const parent = block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
  const root = block.closest?.<HTMLElement>(PANEL_SELECTOR);
  return parent && (!root || isInPanel(root, parent)) ? parent : null;
}

/**
 * Focuses a rendered block and places a collapsed caret at a text offset.
 *
 * Page's shared TreeWalker converts the editor's flat string offset back into a
 * DOM text node and node-relative offset. The requested position is clamped by falling back
 * to the end of the content, which keeps focus restoration safe after concurrent
 * text changes. Empty blocks place the caret directly in their content element.
 * Missing blocks are offered to the host mounting bridge before lookup; focus
 * retains native scrolling and does not write canonical model selection.
 *
 * @param root - Active surface root containing the rendered block.
 * @param blockId - Persisted ID of the block to focus.
 * @param offset - Requested plain-text caret offset.
 * @returns True when the block and editable content were found, even if native
 * Selection is unavailable; false when content remains absent after mounting.
 * @throws Propagates synchronous mounting, browser focus and Range failures.
 */
export function focusBlock(root: HTMLElement, blockId: string, offset: number): boolean {
  if (!findRenderedBlock(root, blockId)) {
    PageNavigationController.getForElement(root)?.mountBlocks([blockId]);
  }
  const block = findRenderedBlock(root, blockId);
  const content = block ? findOwnedContent(block) : null;
  if (!content) {
    return false;
  }

  BlockDOMSelection.focusContent(content, offset);
  return true;
}

/**
 * Resolves Up/Down using rendered lines rather than newline characters.
 *
 * Soft wrapping does not exist in the block's stored string, so the only
 * reliable source is DOM geometry. The scan measures every character offset;
 * repeated text-node walks and line lookups also depend on markup and wrapping.
 * Page blocks are intentionally short, and a cached layout index can replace
 * the scan later if profiling shows long code blocks need one.
 * Geometry is delegated to Page; occurrence lookup and lazy mounting remain here.
 *
 * @param root - Receiving occurrence, including all its Edgeless cards.
 * @param position - Current block identity and UTF-16 caret offset.
 * @param direction - Previous or next visual line.
 * @returns Resolved caret position, or undefined at the occurrence edge or without content.
 * @throws Propagates DOM measurement and synchronous mounting failures.
 */
export function verticalCaretPosition(
  root: HTMLElement,
  position: EditorPosition,
  direction: "up" | "down",
): EditorPosition | undefined {
  const currentBlock = findRenderedBlock(root, position.blockId);
  const currentContent = currentBlock ? findOwnedContent(currentBlock) : null;
  if (!currentContent) {
    return;
  }
  return BlockDOMSelection.verticalCaretPosition(currentContent, position.offset, direction, () =>
    findVerticalAdjacentContent(root, position.blockId, direction),
  );
}

/**
 * Mounts a neighboring display root when needed and finds its editable content.
 *
 * Vertical movement spans the occurrence, skips contentless blocks and excludes
 * nested panels. Horizontal movement retains its separate card-local policy.
 *
 * @param root - Receiving panel or explicitly bounded DOM region.
 * @param blockId - Current rendered block whose neighbor is requested.
 * @param direction - Previous or next visual block in DOM order.
 * @returns Adjacent editable content, or undefined at the occurrence edge.
 * @throws Propagates synchronous host mounting failures.
 */
function findVerticalAdjacentContent(
  root: HTMLElement,
  blockId: string,
  direction: "up" | "down",
): HTMLElement | undefined {
  let blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
  let currentIndex = blocks.findIndex(
    (block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId,
  );
  if (
    ((direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === blocks.length - 1)) &&
    PageNavigationController.getForElement(root)
  ) {
    PageNavigationController.getForElement(root)?.mountAdjacentBlocks(
      blockId,
      direction === "up" ? -1 : 1,
    );
    blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
    currentIndex = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  }
  for (
    let index = currentIndex + (direction === "up" ? -1 : 1);
    index >= 0 && index < blocks.length;
    index += direction === "up" ? -1 : 1
  ) {
    const content = findOwnedContent(blocks[index]!);
    const adjacentId = blocks[index]!.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!content || !adjacentId) {
      continue;
    }
    return content;
  }
  return;
}
