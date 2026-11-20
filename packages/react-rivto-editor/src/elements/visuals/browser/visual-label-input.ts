import type { MouseEventHandler } from "react";
import type { EditableLabelFocusPoint } from "../../../components";
import type { ReactPanelApi } from "../../../panels/types";

/**
 * Adapts React double-click delivery to a visual label's editing policy.
 *
 * React delivers nested controls first, so a child can stop propagation before
 * the visual enters editing. The panel's current Root must still be available.
 *
 * @param panel - Borrowed panel whose current Root bounds editing input.
 * @param enabled - Whether this visual supports label editing.
 * @param start - Starts editing at the double-click's viewport point.
 * @returns React handler that forwards only a point while the Root is current.
 * @throws Propagates Root ownership checks and editing callback failures.
 */
export function createVisualLabelInput(
  panel: Pick<ReactPanelApi, "inputRoot"> | undefined,
  enabled: boolean,
  start: (point: EditableLabelFocusPoint) => void,
): MouseEventHandler<HTMLDivElement> {
  return (event) => {
    if (!enabled) {
      return;
    }
    const root = panel?.inputRoot;
    if (!root?.isAttached() || panel?.inputRoot !== root) {
      return;
    }
    event.stopPropagation();
    start({ x: event.clientX, y: event.clientY });
  };
}
