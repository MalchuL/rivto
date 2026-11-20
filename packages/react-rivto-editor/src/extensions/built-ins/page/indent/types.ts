import type { ReactPanelApi } from "../../../../panels/types";
import type { BlockOutlineEditor, BlockOutlinePanel } from "../../../../block-behaviors/types";

/** Shared outline policy operations used by the indent shortcut. */
export interface IndentEditor extends BlockOutlineEditor {
  /** Dispatches outline behavior and checks move permissions. */
  readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "dispatch" | "canMove">;
}

/** Panel operations borrowed by the indent shortcut. */
export interface IndentPanel extends BlockOutlinePanel {
  /** Shared outline policy operations. */
  readonly editor: IndentEditor;
}

/** Configuration accepted by the page indentation extension. */

/** Shortcut overrides for structural indentation. */
export interface IndentExtensionOptions {
  /** Bindings that indent the active block or eligible sibling selection. */
  readonly indentKeys?: readonly string[];
  /** Bindings that outdent while preserving the selected subtree structure. */
  readonly outdentKeys?: readonly string[];
}
