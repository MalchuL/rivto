import { useSyncExternalStore } from "react";
import type { EdgelessOperations } from "../../edgeless-operations";
import type { EdgelessVisualTool } from "../types";

/** Subscribes to the controller's local creation tool. */
export function useVisualTool(controller: EdgelessOperations): EdgelessVisualTool {
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getTool(),
    () => controller.getTool(),
  );
}
