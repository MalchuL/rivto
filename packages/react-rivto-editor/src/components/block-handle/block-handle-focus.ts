import type { ReactPanelApi } from "../../panels/types";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import type { BlockHandleMenuState } from "./types";

/**
 * Restores focus to the handle captured when its menu opened.
 *
 * The panel must still borrow the same Root. The Root rejects disconnected or
 * foreign regions and retains ordinary browser scrolling for this focus request.
 *
 * @param panel - Panel whose current Root identifies the active occurrence.
 * @param menu - Handle identity and Root captured at menu invocation.
 * @returns Focus has been requested only if the captured occurrence is current.
 * @throws Propagates browser focus and ownership-check failures.
 */
export function restoreBlockHandleFocus(
  panel: Pick<ReactPanelApi, "inputRoot">,
  menu: Pick<BlockHandleMenuState, "inputRoot" | "identity">,
): void {
  if (menu.inputRoot && panel.inputRoot === menu.inputRoot) {
    menu.inputRoot.focusRegionByIdentity(menu.identity, PANEL_SELECTOR, { preventScroll: false });
  }
}
