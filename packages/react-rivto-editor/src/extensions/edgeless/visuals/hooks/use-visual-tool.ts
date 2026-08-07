import { useSyncExternalStore } from "react";
import type { EdgelessVisualController } from "../controller";
import type { EdgelessVisualTool } from "../types";

/** Subscribes to the controller's local creation tool. */
export function useVisualTool(controller: EdgelessVisualController): EdgelessVisualTool {
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getTool(),
    () => controller.getTool(),
  );
}
