import type { ReactPanelApi } from "../../panels/types";
import type { BlockContextMenuContext } from "./types";
import { executeBlockMenuEntry } from "./targets";
/** Captured menu target IDs without an application-supplied panel. */
export type BlockContextMenuTargets = Omit<BlockContextMenuContext, "reactPanel">;
/** Binds shared menu contributions to the invoking editor occurrence. */
export class PanelBlockContextMenuManager {
  /**
   * Binds shared registrations to one invoking editor occurrence.
   *
   * @param reactPanel - Occurrence whose guarded operations all actions receive.
   */
  constructor(private readonly reactPanel: ReactPanelApi) {}
  /**
   * Resolves available menu definitions for captured targets in this panel.
   *
   * Availability predicates receive this manager's panel even if a caller passes
   * an object containing another reactPanel. This read does not verify target
   * existence or remove empty submenus; execution performs the target check.
   *
   * @param targets - Captured clicked block, explicit targets, and root IDs.
   * @returns Ordered definition references whose isAvailable callback is absent
   * or does not return false.
   * @throws If an availability predicate throws.
   */
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
