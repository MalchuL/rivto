import type { ReactPanelApi } from "../../panels/types";
import { useReactPanelContext } from "./use-react-panel-context";

/**
 * Returns the API supplied by the nearest EditorPanel component in the React tree.
 *
 * In an embedding, this is the view of the referenced document or subtree. It keeps
 * its own DOM root and local event registrations, even if another view later gains
 * focus. Shared document operations are available through reactPanel.document and
 * rendering registries through reactPanel.editor; selection, clipboard, and slash operations use this view.
 * Retained commands keep editing their original document rather than following focus.
 * @returns The surrounding view API, shared by components within that EditorPanel or EditorEmbed.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useReactPanel(): ReactPanelApi {
  return useReactPanelContext().reactPanel;
}
