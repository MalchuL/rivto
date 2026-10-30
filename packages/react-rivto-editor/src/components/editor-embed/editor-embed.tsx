import { ReactPanelProvider } from "../editor-panel/react-panel-provider";
import type { EditorEmbedProps } from "./types";
import { EmbeddingPanel, type PanelOptions } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/** Creates core boundaries that include and protect the required source block root. */
function createEmbeddingPanel(editor: ReactEditorApi, options: PanelOptions) {
  const { rootBlockId } = options;
  if (!rootBlockId) {
    throw new Error("Embedding panel requires a block root");
  }
  return new EmbeddingPanel(editor, { ...options, rootBlockId });
}

/**
 * Displays the source block and descendants through a panel that protects its root.
 * The host retains the source editor and document while this component owns local bindings.
 * @param props - Shared source editor, required block root and explicit surface children.
 * @returns The embedding context and surface, or its root availability indicator.
 */
export function EditorEmbed(props: EditorEmbedProps) {
  return <ReactPanelProvider {...props} createPanel={createEmbeddingPanel} />;
}
