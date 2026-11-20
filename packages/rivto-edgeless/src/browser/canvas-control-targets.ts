/**
 * Resolves mounted canvas geometry hosts for the requested participant identities.
 *
 * The first host for each identity wins, and hosts remain in document order.
 * Missing identities are omitted; offscreen measurement hosts are managed separately.
 *
 * @param plane - World layer containing the mounted hosts.
 * @param ids - Stable identities of concrete transform participants.
 * @returns Unique mounted hosts inside the supplied world layer.
 */
export function findCanvasControlTargets(
  plane: HTMLElement,
  ids: readonly string[],
): HTMLElement[] {
  const remaining = new Set(ids);
  if (!remaining.size) {
    return [];
  }
  return [...plane.querySelectorAll<HTMLElement>("[data-canvas-element]")].filter((host) =>
    remaining.delete(host.dataset.canvasElement!),
  );
}
