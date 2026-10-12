import { usePanelContent } from "../../hooks/editor/use-panel-content";
import type { EditorEmbedProps } from "./types";

/**
 * Displays the source block and descendants through a panel that protects its root.
 * The host retains the source editor and document while this component owns local bindings.
 * @param props - Shared source editor, required block root and explicit surface children.
 * @returns The embedding context and surface, or its root availability indicator.
 */
export function EditorEmbed(props: EditorEmbedProps) {
  return usePanelContent(props, true);
}
