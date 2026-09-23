/**
 * Cross-document node checks that do not use the current realm's constructors.
 *
 * An editor mounted in an iframe or another window has a different `Element`
 * and `Node` identity. Duck-typing `nodeType` keeps selection and popovers
 * working against that foreign document.
 *
 * @module
 */

/**
 * Returns whether a value is a DOM Node from any realm.
 *
 * @param value - Event target or unknown candidate.
 * @returns True when `nodeType` is a number.
 */
export function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).nodeType === "number";
}

/**
 * Returns whether a value is an Element from any realm.
 *
 * @param value - Event target or unknown candidate.
 * @returns True when the node is an element (`nodeType === 1`).
 */
export function isElementNode(value: unknown): value is Element {
  return isNodeLike(value) && value.nodeType === 1;
}

/**
 * Returns whether a value is an HTMLElement from any realm.
 *
 * @param value - Event target or unknown candidate.
 * @returns True when the node is an element with a `tagName`.
 */
export function isHTMLElementNode(value: unknown): value is HTMLElement {
  return isElementNode(value) && typeof (value as HTMLElement).tagName === "string";
}
