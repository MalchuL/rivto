import { RegionIdentity } from "../../events/types";

/** Opaque identities for comparing browser elements without exposing them. */
const identities = new WeakMap<Element, RegionIdentity>();
const elements = new WeakMap<object, WeakRef<Element>>();

/**
 * Returns a stable opaque identity for one browser element.
 *
 * The identity describes the element, not an attachment; callers must check
 * the relevant attachment separately before acting on a match.
 *
 * @param element - Browser element to identify.
 * @returns Identity shared by captures of that exact element.
 */
export function inputElementIdentity(element: Element): RegionIdentity {
  let identity = identities.get(element);
  if (!identity) {
    identity = new RegionIdentity();
    identities.set(element, identity);
    elements.set(identity, new WeakRef(element));
  }
  return identity;
}

/**
 * Resolves an opaque identity within the browser adapter.
 *
 * @param identity - Identity previously issued for a browser element.
 * @returns The element while it is retained elsewhere, or undefined after collection or for an unknown identity.
 */
export function inputElementForIdentity(identity: object): Element | undefined {
  return elements.get(identity)?.deref();
}
