import type { InputRoot } from "../../events/types";

const elements = new WeakMap<object, HTMLElement>();

/**
 * Associates a browser occurrence with its mounting element inside Root.
 *
 * @param root - Occurrence whose lifetime controls its browser operations.
 * @param element - Mounting element retained by the occurrence.
 * @returns The internal lookup recognizes this occurrence.
 */
export function rememberBrowserInputRoot(root: InputRoot, element: HTMLElement): void {
  elements.set(root, element);
}

/**
 * Resolves the mounting element of a Root-owned browser occurrence.
 *
 * @param root - Occurrence selected for browser input normalization.
 * @returns Its element, or undefined when the occurrence is not owned by this browser adapter.
 */
export function getBrowserInputRootElement(root: object): HTMLElement | undefined {
  return elements.get(root);
}
