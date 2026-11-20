import { BrowserInputRoot } from "../browser-input-root";

const roots = new WeakMap<HTMLElement, BrowserInputRoot>();

/**
 * Reuses browser occurrences for test elements across listener reconciliations.
 *
 * @param elements - Surfaces retained by the test.
 * @returns Browser Roots corresponding to those elements in the same order.
 */
export function testInputRoots(elements: ReadonlySet<HTMLElement>): ReadonlySet<BrowserInputRoot> {
  return new Set(
    [...elements].map((element) => {
      let root = roots.get(element);
      if (!root) {
        root = new BrowserInputRoot(element);
        roots.set(element, root);
      }
      return root;
    }),
  );
}
