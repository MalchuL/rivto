import type { RegionIdentity } from "@chulane/rivto-root";
import type { BlockModalFocusPanel } from "./types";

const PANEL_BOUNDARY = "[data-rivto-panel]";

/**
 * Restores focus to the inline modal toggle within its current parent occurrence.
 *
 * The captured inline region and toggle must remain in the same mounted Root.
 * Nested panels are excluded, and scrolling follows the browser's default focus behavior.
 *
 * @param panel - Parent panel retaining ownership of the mounted Root.
 * @param inlineIdentity - Mounted inline wrapper, or undefined after unmount.
 * @param selector - Selector identifying the modal's toggle within that wrapper.
 * @returns Focus is requested only for a toggle owned by the current occurrence.
 * @throws Propagates selector, ownership, or browser focus failures.
 */
export function focusBlockModalToggle(
  panel: BlockModalFocusPanel,
  inlineIdentity: RegionIdentity | undefined,
  selector: string,
): void {
  const root = panel.mountedRoot;
  if (!root || !inlineIdentity || !root.isAttached() || panel.mountedRoot !== root) {
    return;
  }
  const inline = root.captureRegionByIdentity(inlineIdentity);
  const toggle = inline?.findOwnedRegion(selector, PANEL_BOUNDARY)?.getIdentity();
  if (toggle && root.isAttached() && panel.mountedRoot === root) {
    root.focusRegionByIdentity(toggle, PANEL_BOUNDARY, { preventScroll: false });
  }
}
