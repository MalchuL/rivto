import { BLOCK_CONTENT_SELECTOR, BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR, BLOCK_ROW_CLASS } from "../../constants";
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

/** DOM reads limited to one document occurrence, excluding nested editor views. */
export class DocumentViewDOM {
  /** @param root - Mounted surface or a local layout region inside that surface. */
  constructor(readonly root: HTMLElement) {}

  /** @returns Rendered block shells in DOM order, excluding nested document views. */
  getBlocks(): HTMLElement[] { return findViewElements(this.root, BLOCK_ID_SELECTOR); }

  /** @param id - Stable block ID. @returns Its rendered shell in this occurrence, or null. */
  findBlock(id: string): HTMLElement | null {
    const selector = `[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(id)}"]`;
    return findViewElements(this.root, selector)[0] ?? null;
  }

  /** @param id - Stable block ID. @returns Its own content host, or null when absent. */
  findContent(id: string): HTMLElement | null {
    const block = this.findBlock(id);
    if (!block) return null;
    const owns = (content: HTMLElement) => content.closest(BLOCK_ID_SELECTOR) === block
      && isInDocumentView(this.root, content);
    const first = block.querySelector<HTMLElement>(BLOCK_CONTENT_SELECTOR);
    if (!first || owns(first)) return first;
    return [...block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)].find(owns) ?? null;
  }

  /** @param block - Rendered shell. @returns Its own content row, or null for custom shells without one. */
  getRow(block: Element): HTMLElement | null {
    return block.querySelector<HTMLElement>(`:scope > .${BLOCK_ROW_CLASS}`);
  }

  /** @param block - Rendered shell. @returns Its own body slot, excluding descendant slots. */
  getBody(block: Element): HTMLElement | null {
    return block.querySelector<HTMLElement>(':scope > [data-slot-owner="block"][data-slot-position="body"]');
  }

  /**
   * @param block - Block whose containing shell is requested.
   * @returns Parent shell within this region and occurrence, or null at its boundary.
   */
  getParent(block: Element): HTMLElement | null {
    const parent = block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    return parent && this.root.contains(parent) && isInDocumentView(this.root, parent) ? parent : null;
  }

  /** @returns Top-level rendered blocks regardless of intervening layout wrappers. */
  getRootBlocks(): HTMLElement[] { return this.getBlocks().filter((block) => !this.getParent(block)); }

  /**
   * Finds the block containing a target, treating a nested view as its enclosing host block.
   * @param target - Pointed or focused element, or null when outside the browser document.
   * @returns Owning block in this occurrence, or null outside its root.
   */
  getBlock(target: Element | null): HTMLElement | null {
    let block = target?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
    while (block && !isInDocumentView(this.root, block)) {
      block = block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
    }
    return block && this.root.contains(block) ? block : null;
  }
}
