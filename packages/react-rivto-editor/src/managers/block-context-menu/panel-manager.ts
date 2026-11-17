import type { ReactPanelApi } from "../../panels/types";
import type { BlockContextMenuEntry, BlockContextMenuTargets } from "./types";
import { executeBlockMenuEntry } from "./targets";
/** Captured menu target IDs without an application-supplied panel. */
export type { BlockContextMenuTargets } from "./types";
/** Binds shared menu contributions to the invoking editor occurrence. */
export class PanelBlockContextMenuManager {
  /**
   * Binds shared registrations to one invoking editor occurrence.
   *
   * @param reactPanel - Occurrence whose guarded operations all actions receive.
   */
  constructor(private readonly reactPanel: ReactPanelApi) {}
  /**
   * Reads the revision of shared menu registrations.
   *
   * @returns The source registry's current revision.
   */
  get revision(): number {
    return this.reactPanel.editor.blockContextMenu.revision;
  }
  /**
   * Registers a menu entry with the shared React runtime.
   *
   * @param entry - Menu contribution to register.
   * @returns Disposer owned by the shared extension lifecycle.
   * @throws If the runtime is inactive or the entry is invalid or duplicated.
   */
  readonly register = (entry: BlockContextMenuEntry) =>
    this.reactPanel.editor.blockContextMenu.register(entry);
  /**
   * Removes a shared menu entry by ID.
   *
   * @param id - Registered contribution identity.
   * @returns Whether a registration was removed.
   * @throws If the shared extension lifecycle is inactive.
   */
  readonly delete = (id: string) => this.reactPanel.editor.blockContextMenu.delete(id);
  /**
   * Looks up a shared menu definition without evaluating availability.
   *
   * @param id - Registered contribution identity.
   * @returns The definition, or undefined when unregistered.
   */
  readonly get = (id: string) => this.reactPanel.editor.blockContextMenu.get(id);
  /**
   * Observes changes to the shared menu registry.
   *
   * @param listener - Callback invoked after a registration changes.
   * @returns Disposer for the subscription.
   */
  readonly subscribe = (listener: () => void) =>
    this.reactPanel.editor.blockContextMenu.subscribe(listener);
  /**
   * Resolves available menu definitions for captured targets in this panel.
   *
   * Availability predicates receive this manager's panel even if a caller passes
   * an object containing another reactPanel. This read does not verify target
   * existence or remove empty submenus; execution performs the target check.
   *
   * @param targets - Captured clicked block, explicit targets, and root IDs;
   * omit to read all shared definitions without panel availability filtering.
   * @returns Ordered definition references whose isAvailable callback is absent
   * or does not return false, or all definitions when targets are omitted.
   * @throws If an availability predicate throws.
   */
  getAll(targets?: BlockContextMenuTargets) {
    if (!targets) {
      return this.reactPanel.editor.blockContextMenu.getAll();
    }
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
