import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { ReactEditorApi } from "../editor/types";
import type { PanelOptions } from "./types";

/** Displays the children of a selected block, or document roots when no block is selected. */
export class ChildrenPanel extends Panel {
  /** @param editor - Retained shared React editor. @param options - Independent roots and optional local mode/navigation. */
  constructor(editor: ReactEditorApi, options: PanelOptions = {}) {
    super(editor, options, new PanelBlocks(editor.document, options.rootBlockId ?? null, false));
  }

  /** Retains the displayed children in their selected element container until this mount ends. */
  protected acquireProjection(): () => void {
    return this.editor.acquirePanel(this.rootBlockId ?? null, this.rootElementId);
  }
}
