/** DOM boundary for a document view, including full-document and embedded subtree surfaces. */
export const DOCUMENT_VIEW_ATTRIBUTE = "data-rivto-document-view";
/** Selector used to distinguish repeated render occurrences and source documents. */
export const DOCUMENT_VIEW_SELECTOR = `[${DOCUMENT_VIEW_ATTRIBUTE}]`;

/** Local registration identity and DOM root belonging to one mounted EditorView. */
export interface DocumentViewScope {
  /** Stable occurrence identity; shared shortcut settings continue to use semantic action IDs. */
  readonly id: string;
  /** Current root, or null before mounting and after cleanup. */
  getRoot(): HTMLElement | null;
  /** Registers the occurrence's root without replacing another view's root. */
  setRoot(root: HTMLElement | null): void;
  /** Owns a local registration until this occurrence is cleaned up. */
  own(dispose: () => void): () => void;
}

/**
 * Limits DOM walks to one displayed document occurrence, including local regions inside it.
 * @param root - Primary surface, embedded subtree, or edgeless card within a view.
 * @param element - Candidate node to include in the DOM walk.
 * @returns Whether the nearest document-view boundary matches; unmarked standalone roots are allowed.
 */
export function isInDocumentView(root: HTMLElement, element: Element): boolean {
  const view = element.closest?.(DOCUMENT_VIEW_SELECTOR);
  const rootView = root.closest?.(DOCUMENT_VIEW_SELECTOR) ?? root;
  return !view || view === rootView;
}

/**
 * Collects matching elements from one occurrence, excluding nested views.
 * @param root - View surface or local region within it.
 * @param selector - DOM selector evaluated below the root.
 * @returns Matching elements in DOM order, owned by this occurrence.
 */
export function findViewElements(root: HTMLElement, selector: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) => isInDocumentView(root, element));
}
