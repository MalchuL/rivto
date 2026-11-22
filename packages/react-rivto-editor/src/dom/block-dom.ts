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
  // A nested embed can render the same block ID as the surrounding page.
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
 * Finds an editable neighbor in depth-first DOM order within the supplied panel or card.
 *
 * At a mounted boundary, Page can synchronously render more roots. Horizontal
 * movement and text merges stop at contentless custom blocks. Vertical navigation
 * skips those blocks to reach the next rendered line within the same occurrence.
 *
 * @param root - Receiving occurrence or card defining the navigation boundary.
 * @param blockId - Rendered block whose neighbor is requested.
 * @param direction - Side of the current block to inspect in document order.
 * @param contentless - Whether a block without editable content stops the search.
 * @returns Editable neighbor with its persisted identity, or null at the boundary.
 * @throws Propagates synchronous host mounting failures.
 */
export function findAdjacentEditableBlock(
  root: HTMLElement,
  blockId: string,
  direction: "previous" | "next",
  contentless: "stop" | "skip" = "stop",
): EventBlock | null {
  let blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
  let index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
  const step = direction === "previous" ? -1 : 1;
  if (index >= 0 && !blocks[index + step]) {
    const navigation = PageNavigationController.getForElement(root);
    if (navigation) {
      navigation.mountAdjacentBlocks(blockId, step);
      blocks = findPanelElements(root, BLOCK_ID_SELECTOR);
      index = blocks.findIndex((block) => block.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId);
    }
  }
  while (index >= 0) {
    index += step;
    const block = blocks[index];
    if (!block) {
      break;
    }
    const content = findOwnedContent(block);
    const adjacentId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (content && adjacentId) {
      // Return the closest eligible content within this occurrence.
      return { block, content, blockId: adjacentId };
    }
    if (contentless === "stop") {
      break;
    }
  }
  return null;
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
  return BlockDOMSelection.verticalCaretPosition(
    currentContent,
    position.offset,
    direction,
    () =>
      findAdjacentEditableBlock(
        root,
        position.blockId,
        direction === "up" ? "previous" : "next",
        "skip",
      )?.content,
  );
}
