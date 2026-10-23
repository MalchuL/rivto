import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_ROW_SELECTOR,
} from "../../constants";
/** DOM boundary for a document panel, including full-document and embedded subtree surfaces. */
export const PANEL_ATTRIBUTE = "data-rivto-panel";
/** Selector used to distinguish repeated render occurrences and source documents. */
export const PANEL_SELECTOR = `[${PANEL_ATTRIBUTE}]`;

/**
 * Limits DOM walks to one displayed document occurrence, including local regions inside it.
 * @param root - Primary surface, embedded subtree, or edgeless card within a panel.
 * @param element - Candidate node to include in the DOM walk.
 * @returns Whether the nearest document-panel boundary matches; unmarked standalone roots are allowed.
 */
export function isInPanel(root: HTMLElement, element: Element): boolean {
  const panel = element.closest?.(PANEL_SELECTOR);
  const rootPanel = root.closest?.(PANEL_SELECTOR) ?? root;
  return !panel || panel === rootPanel;
}

/**
 * Collects matching elements from one occurrence, excluding nested panels.
 * @param root - Panel surface or local region within it.
 * @param selector - DOM selector evaluated below the root.
 * @returns Matching elements in DOM order, owned by this occurrence.
 */
export function findPanelElements(root: HTMLElement, selector: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) =>
    isInPanel(root, element),
  );
}

/** DOM reads limited to one document occurrence, excluding nested editor panels. */
export class PanelDOM {
  /** @param root - Mounted surface or a local layout region inside that surface. */
  constructor(readonly root: HTMLElement) {}

  /** @returns Rendered block shells in DOM order, excluding nested document panels. */
  getBlocks(): HTMLElement[] {
    return findPanelElements(this.root, BLOCK_ID_SELECTOR);
  }

  /** @param id - Stable block ID. @returns Its rendered shell in this occurrence, or null. */
  findBlock(id: string): HTMLElement | null {
    const selector = `[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(id)}"]`;
    return findPanelElements(this.root, selector)[0] ?? null;
  }

  /** @param id - Stable block ID. @returns Its own content host, or null when absent. */
  findContent(id: string): HTMLElement | null {
    const block = this.findBlock(id);
    if (!block) {
      return null;
    }
    const owns = (content: HTMLElement) =>
      content.closest(BLOCK_ID_SELECTOR) === block && isInPanel(this.root, content);
    const first = block.querySelector<HTMLElement>(BLOCK_CONTENT_SELECTOR);
    if (!first || owns(first)) {
      return first;
    }
    return [...block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)].find(owns) ?? null;
  }

  /** @param block - Rendered shell. @returns Its own content row, or null for custom shells without one. */
  getRow(block: Element): HTMLElement | null {
    return block.querySelector<HTMLElement>(`:scope > ${BLOCK_ROW_SELECTOR}`);
  }

  /** @param block - Rendered shell. @returns Its own body slot, excluding descendant slots. */
  getBody(block: Element): HTMLElement | null {
    return block.querySelector<HTMLElement>(
      ':scope > [data-slot-owner="block"][data-slot-position="body"]',
    );
  }

  /**
   * @param block - Block whose containing shell is requested.
   * @returns Parent shell within this region and occurrence, or null at its boundary.
   */
  getParent(block: Element): HTMLElement | null {
    const parent = block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    return parent && this.root.contains(parent) && isInPanel(this.root, parent) ? parent : null;
  }

  /** @returns Top-level rendered blocks regardless of intervening layout wrappers. */
  getRootBlocks(): HTMLElement[] {
    return this.getBlocks().filter((block) => !this.getParent(block));
  }

  /**
   * Finds the block containing a target, treating a nested panel as its enclosing host block.
   * @param target - Pointed or focused element, or null when outside the browser document.
   * @returns Owning block in this occurrence, or null outside its root.
   */
  getBlock(target: Element | null): HTMLElement | null {
    let block = target?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
    while (block && !isInPanel(this.root, block)) {
      block = block.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
    }
    return block && this.root.contains(block) ? block : null;
  }
}
