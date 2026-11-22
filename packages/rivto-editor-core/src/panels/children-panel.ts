import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { DocumentEditorAPI } from "../editor/types";
import type { PanelOptions } from "./types";

/** Displays the children of a selected block, or document roots when no block is selected. */
export class ChildrenPanel extends Panel {
  /**
   * Creates a children view over the supplied editor or panel.
   *
   * Omitted roots retain a source panel's boundaries and root visibility. The
   * supplied editor remains owned by its caller and is never destroyed here.
   *
   * @param editor - Borrowed document editor or source panel.
   * @param options - Independent block and element roots; omitted roots use the source boundaries.
   * @throws If the editor does not provide the standard document managers.
   */
  constructor(editor: DocumentEditorAPI, options: PanelOptions = {}) {
    const source = editor.blocks instanceof PanelBlocks ? editor.blocks : undefined;
    const rootBlockId = options.rootBlockId ?? source?.rootBlockId ?? null;
    const includeRoot = options.rootBlockId == null && source ? source.includeRoot : false;
    super(editor, options, new PanelBlocks(editor, rootBlockId, includeRoot));
  }
}
