import type { RegionIdentity } from "@chulane/rivto-root";
import { PANEL_SELECTOR } from "../../../panels/panel-dom";
import type { EditableLabelText } from "../../types";
import type { EditableLabelPanel } from "../types";

/**
 * Captures label text operations from the currently mounted occurrence.
 *
 * @param panel - Panel owning the mounted Root.
 * @param identity - Opaque identity captured at the label's mounting or delivery boundary.
 * @returns Owned text capability, or undefined when the label is unavailable or foreign.
 * @throws Propagates Root attachment and browser selector failures.
 */
export function captureLabelText(
  panel: Pick<EditableLabelPanel, "mountedRoot">,
  identity: RegionIdentity,
): EditableLabelText | undefined {
  const root = panel.mountedRoot;
  const target = root?.captureEditableTextByIdentity(identity, PANEL_SELECTOR);
  return panel.mountedRoot === root ? target : undefined;
}
