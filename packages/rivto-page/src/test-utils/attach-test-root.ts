import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { BlockEditorController } from "../editor/block-editor-controller";

const roots = new Set<BrowserInputRoot>();

afterEach(() => {
  for (const root of roots) {
    root.detach();
  }
  roots.clear();
});

/**
 * Mounts a test element as an occurrence and attaches a borrowed Root to Page.
 *
 * @param editor - Page controller borrowing this occurrence.
 * @param element - Browser element owned by the test fixture.
 * @returns Cleanup releasing Page's attachment and the test-owned Root.
 * @throws Propagates attachment and cleanup failures.
 */
export function attachTestRoot(
  editor: Pick<BlockEditorController, "attach">,
  element: HTMLElement,
): () => void {
  const root = new BrowserInputRoot(element);
  roots.add(root);
  let detach: () => void;
  try {
    detach = editor.attach(root);
  } catch (error) {
    root.detach();
    roots.delete(root);
    throw error;
  }
  return () => {
    try {
      detach();
    } finally {
      root.detach();
      roots.delete(root);
    }
  };
}
