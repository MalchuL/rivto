import { useEdgelessTools } from "../../surfaces/edgeless/edgeless-tools-context";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";

/**
 * Reads canvas operations and shared tool/default/preview state for this surface.
 *
 * Document and tool observers are connected after render
 * and released on unmount. Mount this hook inside the edgeless representation:
 * switching to page mode unmounts its owner and returning creates fresh state.
 * Separate calls receive the same operations and preview state. The surface provider
 * owns subscriptions and supplies shared settings to operation and transform consumers.
 *
 * @returns Operations bound to the surrounding panel's element and selection scope.
 * @throws If called outside an EdgelessSurface subtree.
 */
export function useEdgelessOperations(): EdgelessOperations {
  return useEdgelessTools().operations;
}
