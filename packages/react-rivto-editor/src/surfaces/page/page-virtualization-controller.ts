/**
 * Page-local bridge from DOM navigation to unmounted top-level blocks.
 *
 * Only the React page surface registers a controller. DOM event helpers use
 * the registration to mount a requested block before focusing its content.
 * The map stores no document data and is cleared on surface unmount.
 *
 * @module
 */

/** Page-local operations needed by commands that focus an unmounted block. */
export interface PageVirtualizationController {
  /**
   * Pins the top-level block containing each requested block in the virtualized
   * range. React synchronously mounts any missing block DOM, including nested
   * blocks, before this method scrolls to the last top-level block.
   *
   * @param blockIds - IDs of blocks to mount, including nested blocks.
   * @returns No value.
   */
  mountBlocks(blockIds: readonly string[]): void;
  /**
   * Pins the top-level block containing `blockId` and its previous or next
   * top-level block. React mounts their DOM if needed, then the page scrolls
   * to the neighbor so keyboard navigation can reach it.
   *
   * @param blockId - ID of the block where keyboard navigation starts.
   * @param direction - -1 for the previous top-level block, 1 for the next.
   * @returns No value.
   */
  mountAdjacentBlocks(blockId: string, direction: -1 | 1): void;
  /**
   * Pins the first or last top-level block, mounting its DOM if needed and
   * scrolling to it so focus can enter from another editor.
   *
   * @param direction - -1 to enter at the last block, 1 to enter at the first.
   * @returns No value.
   */
  mountFirstOrLastBlock(direction: -1 | 1): void;
}

const controllers = new WeakMap<HTMLElement, PageVirtualizationController>();
const PAGE_SURFACE_CLASS = "page-surface";

/**
 * Registers a page virtualization controller for its surface lifetime.
 *
 * @param root - Page surface that owns the controller.
 * @param controller - Operations for mounting target blocks.
 * @returns Cleanup that removes the registration.
 */
export function registerPageVirtualizationController(root: HTMLElement, controller: PageVirtualizationController): () => void {
  controllers.set(root, controller);
  return () => controllers.delete(root);
}

/**
 * Finds the virtual page associated with a DOM scope.
 *
 * @param root - Surface or descendant used by a DOM navigation helper.
 * @returns Its page virtualization controller, or undefined when the page is not virtualized.
 */
export function getPageVirtualizationControllerForElement(root: HTMLElement): PageVirtualizationController | undefined {
  return controllers.get(root.closest<HTMLElement>(`.${PAGE_SURFACE_CLASS}`) ?? root);
}
