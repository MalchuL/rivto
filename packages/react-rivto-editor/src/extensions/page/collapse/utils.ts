/** Selection-to-block target projection for page collapse commands. */
import { getSelectedBlockIds, type Selection } from "@chulane/rivto";

/**
 * Resolves the edited block or all blocks in the active whole-block selection.
 *
 * @param selection - Current portable selection.
 * @returns Selected block identifiers in document order.
 */
export function collapseTargets(selection: Selection | undefined): string[] {
  return selection ? getSelectedBlockIds(selection) : [];
}
