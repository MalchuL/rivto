import { ReactPanelProvider } from "./react-panel-provider";
import type { EditorPanelProps } from "./types";
import { ChildrenPanel, type PanelOptions } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/** Creates core boundaries that display children of the selected block root. */
function createChildrenPanel(editor: ReactEditorApi, options: PanelOptions) {
  return new ChildrenPanel(editor, options);
}

/**
 * Displays children of a selected block, or document roots when no root is supplied.
 * The host owns navigation, titles, persistence, the shared editor and document;
 * this component owns only its panel bindings. Optional navigation records are
 * checked against the supplied editor before their roots are used. Missing roots
 * remain selected and empty until synchronization or undo restores their data.
 * @param props - Shared editor, optional roots, local mode and explicit surface children.
 * @returns The panel context and surface, or its root availability indicator.
 * @throws If an optional navigation record refers to a different document.
 */
export function EditorPanel(props: EditorPanelProps) {
  return <ReactPanelProvider {...props} createPanel={createChildrenPanel} />;
}
