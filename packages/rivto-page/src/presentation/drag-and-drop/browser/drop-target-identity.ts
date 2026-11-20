import { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";

/**
 * Resolves a committed drop target to its opaque browser identity.
 *
 * Ordinary DOM children supply an element; identity-forwarding Page primitives
 * supply the identity directly. Elements from another window, including a
 * detached document, retain their native element brand when checked.
 *
 * @param target - Mounted DOM child or identity forwarded by a Page primitive.
 * @returns The existing identity or the browser identity of the mounted element.
 * @throws If the target is neither an element nor a region identity, or browser identity capture fails.
 */
export function getDropTargetIdentity(target: object): RegionIdentity {
  if (isBrowserElement(target)) {
    return getBrowserElementIdentity(target);
  }
  if (target instanceof RegionIdentity) {
    return target;
  }
  throw new TypeError("Drop targets require an element or region identity");
}

/**
 * Checks whether a committed target has the native element brand across realms.
 *
 * @param target - Value delivered to a composed ref.
 * @returns True only when the target has the browser's element brand.
 * @throws Propagates delegated browser property access failures.
 */
function isBrowserElement(target: object): target is Element {
  if (typeof Element === "undefined") {
    return false;
  }
  if (target instanceof Element) {
    return true;
  }
  if (!("nodeType" in target) || target.nodeType !== 1) {
    return false;
  }
  try {
    // The native method checks the DOM element brand across window realms.
    Reflect.apply(Element.prototype.hasAttribute, target, ["data-rivto-block-editor"]);
    return true;
  } catch {
    return false;
  }
}
