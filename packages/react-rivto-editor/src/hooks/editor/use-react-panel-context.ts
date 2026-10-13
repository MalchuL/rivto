import { useContext } from "react";
import { ReactPanelContext } from "../../components/editor-panel/react-panel-context";
import type { ReactPanelContextValue } from "../../components/editor-panel/types";

/**
 * Reads the complete internal EditorPanel context.
 *
 * Public hooks use this helper so the provider requirement and error message
 * stay consistent. Consumers should normally use `useReactPanel`, `useBlock`, or
 * another focused hook rather than depending on the revision implementation.
 *
 * @returns The nearest EditorPanel's stable editor references.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useReactPanelContext(): ReactPanelContextValue {
  const panelContextValue = useContext(ReactPanelContext);
  if (!panelContextValue) throw new Error("Editor hooks must be used inside EditorPanel or EditorEmbed");
  return panelContextValue;
}
