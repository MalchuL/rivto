import { useEffect, useMemo } from "react";
import { useReactPanel } from "../editor/use-react-panel";
import { EdgelessOperations } from "../../managers/elements/edgeless-operations";

/**
 * Creates canvas operations and local tool/default/preview state for this component.
 *
 * Document and tool observers are connected after render
 * and released on unmount. Mount this hook inside the edgeless representation:
 * switching to page mode unmounts its owner and returning creates fresh state.
 * Separate calls own separate state; pass the returned operations to children
 * that must share the same tools and previews.
 *
 * @returns Operations bound to the surrounding panel's element and selection scope.
 * @throws If called outside an EditorPanel subtree.
 */
export function useEdgelessOperations(): EdgelessOperations {
  const reactPanel = useReactPanel();
  const operations = useMemo(() => new EdgelessOperations(reactPanel.editor, reactPanel), [reactPanel]);
  useEffect(() => operations.observeChanges(), [operations]);
  return operations;
}
