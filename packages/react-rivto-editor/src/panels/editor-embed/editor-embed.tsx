import { ReactPanelProvider } from "../react-panel-provider";
import type { EditorEmbedProps } from "./types";
import { EmbeddingPanel, type PanelOptions } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/**
 * Creates a panel whose displayed source block is protected against removal and movement.
 *
 * @param editor - Source editor or bounded parent panel.
 * @param options - Block and element roots selected by the provider.
 * @returns A core panel that includes the source block among its visible roots.
 * @throws If the block root is absent or an empty string.
 */
function createEmbeddingPanel(editor: ReactEditorApi, options: PanelOptions) {
  const { rootBlockId } = options;
  if (!rootBlockId) {
    throw new Error("Embedding panel requires a block root");
  }
  return new EmbeddingPanel(editor, { ...options, rootBlockId });
}

/**
 * Displays the source block and descendants through a panel that protects its root.
 *
 * The host retains the source editor and document while this component owns local bindings.
 *
 * @param props - Shared source editor, required block root and explicit surface children.
 * @returns The embedding context and surface, or its root availability indicator.
 */
export function EditorEmbed(props: EditorEmbedProps) {
  return <ReactPanelProvider {...props} createPanel={createEmbeddingPanel} />;
}
