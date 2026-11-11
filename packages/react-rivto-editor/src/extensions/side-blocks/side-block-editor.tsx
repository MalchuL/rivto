import { useCallback, type ReactNode } from "react";
import { ChildrenPanel } from "@chulane/rivto";
import { ReactPanelProvider } from "../../components/editor-panel/react-panel-provider";
import { useReactPanel } from "../../hooks";
import type { ReactEditorApi } from "../../editor/types";
import { SurfaceBoundary } from "../../surfaces/surface";

/** Side-block collection and its extension-owned presentation. */
export interface SideBlockEditorProps {
  /** Document block whose children form this panel's root list. */
  readonly rootBlockId: string;
  /** Cards rendered inside the panel. */
  readonly children: ReactNode;
}

/**
 * Binds an independent panel to one side-block collection.
 *
 * @param props - Collection and cards displayed by the panel.
 * @param props.rootBlockId - Document block whose children appear in the side panel.
 * @param props.children - Rendered side cards.
 * @returns A panel with its registered extension UI; its surface registers the DOM root.
 */
export function SideBlockEditor({ rootBlockId, children }: SideBlockEditorProps) {
  const host = useReactPanel();
  const createPanel = useCallback(
    (editor: ReactEditorApi) => new ChildrenPanel(editor, { rootBlockId }),
    [rootBlockId],
  );
  return (
    <ReactPanelProvider editor={host.editor} rootBlockId={rootBlockId} createPanel={createPanel}>
      <SideBlockEditorRoot>{children}</SideBlockEditorRoot>
    </ReactPanelProvider>
  );
}

/**
 * Mounts the current editor extension UI around the side panel's content.
 *
 * @param props - Side card children.
 * @param props.children - Cards within the side panel.
 * @returns The side content and the current extension components.
 */
function SideBlockEditorRoot({ children }: { readonly children: ReactNode }) {
  return (
    <SurfaceBoundary type="block">
      <div>{children}</div>
    </SurfaceBoundary>
  );
}
