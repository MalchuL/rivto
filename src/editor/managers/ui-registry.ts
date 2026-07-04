import type { EditorMode } from "../editor/types";

export type UISlot = "toolbar" | "sideMenu";

/** Command-backed UI action contributed by a runtime plugin. */
export interface UIContribution {
  /** Globally unique contribution ID used for lifecycle ownership. */
  id: string;
  /** Editor location where the renderer may expose the action. */
  slot: UISlot;
  /** Human-readable action label. */
  title: string;
  /** Command executed when the action is activated. */
  command: string;
  /** Optional local modes in which the action is visible. */
  modes?: EditorMode[];
  /** Optional native block types for which the action is visible. */
  blockTypes?: string[];
}

/**
 * Stores declarative command-backed UI contributions.
 *
 * The registry intentionally does not render components or execute commands.
 * Framework bindings query it with their current mode and block context, then
 * call CommandRegistry when the user activates an item.
 */
export class UIRegistry {
  private readonly items = new Map<string, UIContribution>();
  /**
   * Registers one uniquely identified contribution.
   *
   * @param item - Portable action metadata owned by a plugin.
   * @returns Idempotent disposer tied to this exact item.
   * @throws If another contribution already owns the ID.
   */
  register(item: UIContribution): () => void {
    if (this.items.has(item.id)) throw new Error(`UI contribution ${item.id} is already registered`);
    this.items.set(item.id, item);
    return () => { if (this.items.get(item.id) === item) this.items.delete(item.id); };
  }
  /**
   * Returns contributions active for a UI location and context.
   *
   * An item restricted to block types is hidden when no active block exists;
   * this prevents context actions from appearing as global toolbar commands.
   *
   * @param slot - UI location being rendered.
   * @param mode - Current local editor mode.
   * @param blockType - Optional active native block type.
   * @returns Fresh array safe for renderer-level composition.
   */
  get(slot: UISlot, mode: EditorMode, blockType?: string): UIContribution[] {
    return [...this.items.values()].filter((item) => item.slot === slot
      && (!item.modes || item.modes.includes(mode))
      && (!item.blockTypes || (blockType !== undefined && item.blockTypes.includes(blockType))));
  }
}
