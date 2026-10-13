import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { DocumentEditorAPI } from "../editor/types";
import type { PanelOptions } from "./types";

/** Displays the children of a selected block, or document roots when no block is selected. */
export class ChildrenPanel extends Panel {
  /** @param editor - Borrowed document editor; this panel never acquires or destroys it. @param options - Independent block and element roots. */
  constructor(editor: DocumentEditorAPI, options: PanelOptions = {}) {
    super(editor, options, new PanelBlocks(editor, options.rootBlockId ?? null, false));
  }

}
