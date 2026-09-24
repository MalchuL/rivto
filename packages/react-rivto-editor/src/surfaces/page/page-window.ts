/**
 * Page-local bridge from DOM navigation to unmounted root blocks.
 *
 * Only the React page surface registers a controller. DOM event helpers use
 * the registration to mount a requested root before focusing its content.
 * The map stores no document data and is cleared on surface unmount.
 *
 * @module
 */

/** Page-local operations needed by commands that focus a currently unmounted root. */
export interface PageWindow {
  /** Mounts requested blocks and scrolls to the last one. */
  ensure(blockIds: readonly string[]): void;
  /** Mounts the neighboring root when keyboard navigation reaches a window edge. */
  ensureAdjacent(blockId: string, direction: -1 | 1): void;
  /** Mounts the last root for -1 or the first root for 1 during cross-editor navigation. */
  ensureEdge(direction: -1 | 1): void;
}

const windows = new WeakMap<HTMLElement, PageWindow>();
const PAGE_SURFACE_CLASS = "page-surface";

/**
 * Registers a page window for its surface lifetime.
 *
 * @param root - Page surface that owns the controller.
 * @param window - Operations for mounting target roots.
 * @returns Cleanup that removes the registration.
 */
export function registerPageWindow(root: HTMLElement, window: PageWindow): () => void {
  windows.set(root, window);
  return () => windows.delete(root);
}

/**
 * Finds the virtual page associated with a DOM scope.
 *
 * @param root - Surface or descendant used by a DOM navigation helper.
 * @returns Its page window, or undefined when the page is not virtualized.
 */
export function pageWindowFor(root: HTMLElement): PageWindow | undefined {
  return windows.get(root.closest<HTMLElement>(`.${PAGE_SURFACE_CLASS}`) ?? root);
}
