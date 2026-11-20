import type { RegionPointHit, RegionPointQuery } from "../../events/types";
import type { InputRootOwnerCheck } from "./types";
import { BrowserInputRegion } from "./input-region";

/**
 * Captures the hit and owning region inside an occurrence, projecting nested occurrences outward.
 *
 * @param root - Receiving occurrence element retained by the browser adapter.
 * @param query - Client coordinates and owner and boundary selectors.
 * @param isAttached - Checks the exact originating attachment.
 * @returns Opaque regions, or undefined when the point is outside or the attachment ends.
 * @throws Propagates hit testing, selector, and attachment-check failures.
 */
export function captureRegionPoint(
  root: HTMLElement,
  query: RegionPointQuery,
  isAttached: InputRootOwnerCheck,
): RegionPointHit | undefined {
  if (!isAttached()) {
    return undefined;
  }
  const hit = root.ownerDocument.elementFromPoint(query.x, query.y);
  if (!hit || !root.contains(hit)) {
    return undefined;
  }
  let projected: Element | null = hit;
  let boundary = projected.closest(query.boundarySelector);
  while (boundary && boundary !== root) {
    projected = boundary.parentElement;
    boundary = projected?.closest(query.boundarySelector) ?? null;
  }
  const owner = boundary === root ? projected?.closest(query.ownerSelector) : null;
  if (!owner || !root.contains(owner) || !isAttached()) {
    return undefined;
  }
  return {
    target: new BrowserInputRegion({
      root,
      element: hit,
      owner: hit,
      ownerSelector: "*",
      isAttached,
    }),
    owner: new BrowserInputRegion({
      root,
      element: owner,
      owner,
      ownerSelector: query.ownerSelector,
      boundarySelector: query.boundarySelector,
      isAttached,
    }),
  };
}
