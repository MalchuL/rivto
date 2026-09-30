/**
 * Page-local bridge from DOM navigation and selection to unmounted root blocks.
 *
 * Only the React page surface registers a controller. DOM event helpers use
 * the registration to mount a requested root before focusing its content and
 * preserve model-backed selections across gaps in the mounted outline.
 * The map stores no document data and is cleared on surface unmount.
 *
 * @module
 */

/** Page-local operations needed by commands that focus a currently unmounted root. */
export interface PageVirtualizationController {
  /**
   * Pins the top-level block containing each requested block in the virtualized
   * range. React synchronously mounts missing block DOM before callers resolve
   * selection endpoints. Unless scrolling is disabled, an offscreen target
   * scrolls into view; an already visible target retains its viewport position.
   *
   * @param blockIds - IDs of blocks to mount, including nested blocks.
   * @param options - Set scroll to false to mount without navigating the viewport.
   * @returns No value.
   */
  mountBlocks(blockIds: readonly string[], options?: PageVirtualizationMountOptions): void;
  /**
   * Pins the top-level block containing `blockId` and its previous or next
   * top-level block. Mounts their DOM and brings an offscreen neighbor into view
   * so keyboard navigation can cross the edge of the mounted range.
   *
   * @param blockId - ID of the block where keyboard navigation starts.
   * @param direction - -1 for the previous top-level block, 1 for the next.
   * @returns No value; the outline boundary has no neighboring root to mount.
   */
  mountAdjacentBlocks(blockId: string, direction: -1 | 1): void;
  /**
   * Pins the first or last top-level block, mounting its DOM and bringing it
   * into view if needed so focus can enter from another editor.
   *
   * @param direction - -1 to enter at the last block, 1 to enter at the first.
   * @returns No value; an empty document has no root to mount.
   */
  mountFirstOrLastBlock(direction: -1 | 1): void;
  /**
   * Reads the complete expanded outline from the model, including unmounted
   * blocks. Descendants hidden by an active collapse policy are excluded.
   * Selection ranges therefore remain complete across virtualized DOM gaps.
   *
   * @returns Block IDs and UTF-16 text lengths in depth-first document order.
   */
  getSelectionBlocks(): readonly PageVirtualizationSelectionBlock[];
  /**
   * Disables browser scroll anchoring on the surface while a structural command
   * preserves its own viewport anchor. Overlapping suspensions share the same
   * saved overflow-anchor style, restored when the last suspension is released.
   *
   * @returns An idempotent release function for this suspension.
   */
  suspendScrollAdjustments(): () => void;
}

/** Controls whether mounting a virtual selection endpoint also navigates to it. */
export interface PageVirtualizationMountOptions {
  /** False preserves the current viewport while mounting the requested roots. */
  readonly scroll?: boolean;
}

/** Model-backed block data needed to build selections across virtual gaps. */
export interface PageVirtualizationSelectionBlock {
  /** Stable block identity. */
  readonly id: string;
  /** Current UTF-16 text length. */
  readonly length: number;
}

const controllers = new WeakMap<HTMLElement, PageVirtualizationController>();
const PAGE_SURFACE_CLASS = "page-surface";

/**
 * Registers a page controller for its surface lifetime.
 *
 * @param root - Page surface that owns the controller.
 * @param controller - Operations for mounting target roots.
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
 * @returns Its page controller, or undefined when the page is not virtualized.
 */
export function getPageVirtualizationControllerForElement(root: HTMLElement): PageVirtualizationController | undefined {
  return controllers.get(root.closest<HTMLElement>(`.${PAGE_SURFACE_CLASS}`) ?? root);
}
