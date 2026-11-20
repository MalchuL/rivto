import type { InputRoot } from "@chulane/rivto-root";
import type { ReactPanelApi } from "../../panels/types";
import { EDGELESS_TRANSFORMING_ATTRIBUTE } from "../../surfaces/edgeless/markers";

/**
 * Checks whether keyboard actions may run in this canvas occurrence.
 *
 * Transform preparation sets the surface marker before the canvas transform
 * snapshot becomes active. Read it live so Escape cannot clear selection or
 * switch tools during any part of that gesture.
 *
 * @param panel - Receiving panel supplying its current input registration.
 * @param inputRoot - Input registration that delivered this keyboard action.
 * @returns True while the same occurrence is attached and not transforming.
 * @throws Propagates attachment and browser property access failures.
 */
export function canRunEdgelessKeyboardAction(
  panel: Pick<ReactPanelApi, "inputRoot">,
  inputRoot: Pick<InputRoot, "isAttached" | "readAttribute">,
): boolean {
  if (panel.inputRoot !== inputRoot || !inputRoot.isAttached()) {
    return false;
  }
  const transforming = inputRoot.readAttribute(EDGELESS_TRANSFORMING_ATTRIBUTE);
  return !transforming && panel.inputRoot === inputRoot && inputRoot.isAttached();
}
