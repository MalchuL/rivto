import type { EditorBlockNode } from "@chulane/rivto";

/** Public operations supplied by the block collapse extension. */
export interface CollapseExtensionFields {
  /**
   * Decides whether structural paste may enter the addressed block's children.
   *
   * @param block - Current detached block node in the destination panel.
   * @returns True when the block accepts a paste at the start of its children.
   */
  canPasteIntoChildren(block: EditorBlockNode): boolean;
}
