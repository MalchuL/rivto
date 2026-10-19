import { useSyncExternalStore } from "react";
import type { EdgelessToolContext } from "../../managers/edgeless-tools/edgeless-tool-context";
import type { EdgelessTool } from "../../managers/edgeless-tools/edgeless-tool";

/**
 * Observes the active tool without subscribing to its individual pointer samples.
 *
 * @param tools - Surface-owned tool context.
 * @returns Current instance, or undefined when no default tool is registered.
 */
export function useVisualTool(tools: EdgelessToolContext): EdgelessTool | undefined {
  useSyncExternalStore(
    (listener) => tools.subscribe(listener),
    () => tools.revision,
    () => tools.revision,
  );
  return tools.active;
}
