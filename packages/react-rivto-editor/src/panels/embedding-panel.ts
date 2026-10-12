import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { ReactEditorApi } from "../editor/types";
import type { PanelOptions } from "./types";

/** Displays one protected source block together with its descendants. */
export class EmbeddingPanel extends Panel {
  /** @param editor - Retained shared React editor. @param options - Independent roots and optional local mode/navigation; the block root is required and protected. */
  constructor(editor: ReactEditorApi, options: PanelOptions & { readonly rootBlockId: string }) {
    super(editor, options, new PanelBlocks(editor.document, options.rootBlockId, true));
  }

  /** Retains the document projection without projecting the protected root as its own children until this mount ends. */
  protected acquireProjection(): () => void {
    return this.editor.acquirePanel(null, this.rootElementId);
  }
}
