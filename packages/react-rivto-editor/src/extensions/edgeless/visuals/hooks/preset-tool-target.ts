import type { InputTarget } from "@chulane/rivto-root";
import { CANVAS_TOOL_ATTRIBUTE } from "@chulane/rivto-edgeless/react";
import { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { PRESET_BUTTON_SELECTOR } from "../components/markers";

/**
 * Resolves an enabled toolbar target to its surface-owned placement tool.
 *
 * @param target - Root-normalized input target, or null outside element ancestry.
 * @param tools - Surface session resolving registered tool identities.
 * @returns Creation tool supporting placement, or undefined for an ineligible target.
 * @throws If delegated selector or tool lookup operations fail.
 */
export function presetToolForTarget(
  target: InputTarget | null,
  tools: Pick<EdgelessToolContext, "getTool">,
): EdgelessCreationTool | undefined {
  const toolId = target?.ancestorAttributeWithinRoot(PRESET_BUTTON_SELECTOR, CANVAS_TOOL_ATTRIBUTE);
  if (!toolId || target?.closestAncestorMatches(PRESET_BUTTON_SELECTOR, ":disabled")) {
    return undefined;
  }
  const tool = tools.getTool(toolId);
  return tool instanceof EdgelessCreationTool && tool.supportsPlacement ? tool : undefined;
}
