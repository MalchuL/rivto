/**
 * Offers captured block roots to a mounted surface at a pointer release point.
 *
 * The surface decides whether the original hit is eligible and whether to
 * perform a document mutation. The IDs and hit element are borrowed; their
 * current state must be checked by the handler before a mutation.
 *
 * @param ids - Captured source block roots.
 * @param x - Release client X coordinate in CSS pixels.
 * @param y - Release client Y coordinate in CSS pixels.
 * @param hit - Element returned by hit testing at the release point.
 * @returns Whether the surface accepted the release.
 * @throws Propagates errors raised by the surface handler.
 */
export type BlockSurfaceDrop = (
  ids: readonly string[],
  x: number,
  y: number,
  hit: Element,
) => boolean;

const drops = new WeakMap<HTMLElement, BlockSurfaceDrop>();

/**
 * Associates a surface root with its handler for unclaimed block releases.
 *
 * Registering another handler for the same element replaces the previous one.
 * The registry does not attach DOM listeners or own the element or handler.
 *
 * @param root - Surface element used as the registry key.
 * @param drop - Handler invoked with source IDs, client coordinates and the original hit.
 * @returns Cleanup that removes the handler if that same callback is still registered for the root.
 */
export function registerBlockSurfaceDrop(root: HTMLElement, drop: BlockSurfaceDrop): () => void {
  drops.set(root, drop);
  return () => {
    if (drops.get(root) === drop) {
      drops.delete(root);
    }
  };
}

/**
 * Offers a release to the nearest registered surface ancestor of the hit element.
 *
 * Hit testing uses the source root's document. Only a registered surface at or
 * inside that root is eligible. The first eligible handler receives the original
 * hit and its result is returned directly; rejection does not try outer handlers.
 * The handler may mutate the document before returning; this function is not a
 * read-only eligibility check.
 *
 * @param root - Source occurrence root.
 * @param ids - Captured source roots.
 * @param x - Release client X coordinate in CSS pixels.
 * @param y - Release client Y coordinate in CSS pixels.
 * @returns The selected handler's result, or false when no eligible handler is found.
 * @throws Propagates errors from hit testing or the selected handler.
 */
export function isDispatchBlockSurfaceDrop(
  root: HTMLElement,
  ids: readonly string[],
  x: number,
  y: number,
): boolean {
  const hit = root.ownerDocument.elementFromPoint(x, y);
  for (let node = hit; node; node = node.parentElement) {
    if (node instanceof HTMLElement) {
      const drop = drops.get(node);
      if (drop && (node === root || root.contains(node))) {
        return drop(ids, x, y, hit!);
      }
    }
    if (node === root) {
      break;
    }
  }
  return false;
}
