import { useSyncExternalStore } from "react";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";
import type { EdgelessVisualTool } from "../../elements/visuals/types";

/** Subscribes to the edgeless operations' local creation tool. */
export function useVisualTool(edgelessOperation: EdgelessOperations): EdgelessVisualTool {
  return useSyncExternalStore(
    (listener) => edgelessOperation.subscribe(listener),
    () => edgelessOperation.getTool(),
    () => edgelessOperation.getTool(),
  );
}
