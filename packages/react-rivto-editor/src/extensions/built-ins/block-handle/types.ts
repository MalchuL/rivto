import type { BlockContextMenuEntry } from "../../../managers/block-context-menu/types";

/** Registration capability borrowed from the block context menu. */
export interface BlockContextMenuRegistration {
  /**
   * Registers a menu entry for the current extension lifecycle.
   *
   * @param entry - Menu contribution to register.
   * @returns Disposer that removes the registered entry.
   * @throws If the registry is inactive or the entry is invalid or duplicated.
   */
  register(entry: BlockContextMenuEntry): () => void;
}
