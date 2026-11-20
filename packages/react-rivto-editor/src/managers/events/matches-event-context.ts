import type { EditorMode } from "@chulane/rivto";
import type { DOMEventDefinition } from "./types";

/**
 * Checks captured panel mode and target scope against a registration.
 *
 * Omitted restrictions accept every mode or scope, including outside-root events.
 * Dynamic availability predicates remain the dispatcher's responsibility.
 *
 * @param definition - Optional mode and scope restrictions.
 * @param mode - Receiving panel's captured surface mode.
 * @param insideRoot - Whether the target was inside the captured surface.
 * @param insideBlock - Whether a block marker was resolved.
 * @param insideContent - Whether a content marker was resolved.
 * @returns Whether the mode and scope restrictions both match.
 */
export function matchesEventContext(
  definition: Pick<DOMEventDefinition, "mode" | "scope">,
  mode: EditorMode,
  insideRoot: boolean,
  insideBlock: boolean,
  insideContent: boolean,
): boolean {
  if (
    definition.mode &&
    !(Array.isArray(definition.mode) ? definition.mode.includes(mode) : definition.mode === mode)
  ) {
    return false;
  }
  if (!definition.scope) {
    return true;
  }
  if (definition.scope === "surface") {
    return insideRoot;
  }
  if (definition.scope === "block") {
    return insideBlock;
  }
  return insideContent;
}
