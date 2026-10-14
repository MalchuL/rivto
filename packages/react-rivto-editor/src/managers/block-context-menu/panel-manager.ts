import type { ReactPanelApi } from "../../panels/types";
import type { BlockContextMenuContext } from "./types";
import { executeBlockMenuEntry } from "./targets";
/** Captured menu target IDs without an application-supplied panel. */
export type BlockContextMenuTargets = Omit<BlockContextMenuContext, "reactPanel">;
/** Binds shared menu contributions to the invoking editor occurrence. */
export class PanelBlockContextMenuManager {
  /** @param reactPanel - Occurrence whose guarded operations all actions receive. */
  constructor(private readonly reactPanel: ReactPanelApi) {}
  /** Returns available ordered entries for the captured targets. */
  getAll(targets: BlockContextMenuTargets) {
    const context = { ...targets, reactPanel: this.reactPanel };
    return this.reactPanel.editor.blockContextMenu
      .getAll()
      .filter((entry) => entry.isAvailable?.(context) !== false);
  }
  /**
   * Executes an action after checking current registration, availability, and target existence.
   * @param id - Registered action identity.
   * @param targets - Captured document-local target IDs, rebound to this panel.
   * @returns Completion of the action, including asynchronous clipboard work.
   * @throws If targets disappeared, the action is unavailable, or execution fails.
   */
  execute(id: string, targets: BlockContextMenuTargets): Promise<void> {
    return executeBlockMenuEntry(id, { ...targets, reactPanel: this.reactPanel });
  }
}
