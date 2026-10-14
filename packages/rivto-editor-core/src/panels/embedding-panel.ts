import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { DocumentEditorAPI } from "../editor/types";
import type { PanelOptions } from "./types";

/** Displays one protected source block together with its descendants. */
export class EmbeddingPanel extends Panel {
  /** @param editor - Borrowed document editor; this panel never acquires or destroys it. @param options - Independent roots; the block root is required and protected. */
  constructor(editor: DocumentEditorAPI, options: PanelOptions & { readonly rootBlockId: string }) {
    super(editor, options, new PanelBlocks(editor, options.rootBlockId, true));
  }
}
