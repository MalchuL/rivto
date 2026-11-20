import type { InputHit } from "../../events/types";
import { inputElementIdentity } from "./input-element-identity";

const targets = new WeakMap<InputHit, Element>();

/**
 * Captures an element for synchronous browser hit resolution.
 *
 * @param element - Element observed by pointer input or hit testing.
 * @returns Opaque hit that can be released after resolution.
 */
export function captureBrowserInputHit(element: Element): InputHit {
  const hit: InputHit = {
    type: "input-hit",
    /**
     * Checks whether this hit still retains a connected target.
     *
     * @returns False after release or target disconnection.
     */
    isCurrent() {
      return Boolean(readBrowserInputHit(hit));
    },
    /**
     * Finds the nearest matching ancestor while this hit stays connected.
     *
     * @param selector - Selector identifying the ancestor.
     * @returns Opaque identity, or undefined for an unavailable hit or missing ancestor.
     * @throws If the browser rejects the selector.
     */
    getNearestAncestorIdentity(selector) {
      const element = readBrowserInputHit(hit);
      const ancestor = element?.closest(selector);
      return ancestor &&
        ancestor.isConnected &&
        ancestor.contains(element ?? null) &&
        readBrowserInputHit(hit) === element
        ? inputElementIdentity(ancestor)
        : undefined;
    },
    /**
     * Releases the target captured by this hit.
     *
     * @returns This hit can no longer resolve its browser element.
     */
    release() {
      targets.delete(hit);
    },
  };
  targets.set(hit, element);
  return hit;
}

/**
 * Resolves a connected browser hit for migration adapters.
 *
 * @param hit - Opaque hit supplied by the browser adapter.
 * @param document - Optional document that must own the element.
 * @returns Connected element in the requested document, or undefined when stale or foreign.
 */
export function readBrowserInputHit(
  hit: InputHit | undefined,
  document?: Document,
): Element | undefined {
  const element = hit && targets.get(hit);
  return element?.isConnected && (!document || element.ownerDocument === document)
    ? element
    : undefined;
}
