import { ReactPanelProvider } from "../react-panel-provider";
import type { EditorPanelProps } from "./types";
import { ChildrenPanel, type PanelOptions } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/**
 * Creates a panel that displays children of the selected root.
 *
 * @param editor - Shared document editor or parent panel restricting this occurrence.
 * @param options - Block and element roots selected by the provider.
 * @returns A core panel borrowed by the React view until effect cleanup.
 */
function createChildrenPanel(editor: ReactEditorApi, options: PanelOptions) {
  return new ChildrenPanel(editor, options);
}

/**
 * Displays children of a selected block, or document roots when no root is supplied.
 *
 * The host owns navigation, titles, persistence, the shared editor and document;
 * this component owns only its panel bindings. A missing root remains selected
 * until synchronization or undo restores its data, and changing the root replaces
 * the panel and its bindings after commit.
 *
 * @param props - Shared editor, optional roots, local mode and explicit surface children.
 * @returns The panel context and surface, or its root availability indicator.
 * @throws If creation of the panel or its local bindings fails after commit.
 */
export function EditorPanel(props: EditorPanelProps) {
  return <ReactPanelProvider {...props} createPanel={createChildrenPanel} />;
}
