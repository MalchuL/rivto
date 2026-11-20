import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { InputRegion } from "@chulane/rivto-root";

/**
 * Captures a test region through a Root with a controllable subsequent lifetime.
 *
 * The supplied lifetime check starts after capture so tests can invalidate the
 * region or trigger reentrant changes during the operation under test.
 *
 * @param element - Occurrence containing the region.
 * @param target - Region element belonging to the occurrence.
 * @param isCurrent - Checks whether the borrowed region remains current.
 * @returns Region capability for the mounted occurrence.
 * @throws If the target cannot be captured from the occurrence.
 */
export function captureTestInputRegion(
  element: HTMLElement,
  target: Element,
  isCurrent: () => boolean,
): InputRegion {
  const root = new BrowserInputRoot(element);
  let captured = false;
  const region = root.captureRegionByIdentity(getBrowserElementIdentity(target), () =>
    captured ? isCurrent() : true,
  );
  if (!region) {
    root.detach();
    throw new Error("Test region must belong to its root");
  }
  captured = true;
  return region;
}
