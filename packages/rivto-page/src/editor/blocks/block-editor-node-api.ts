import type { BlockEditorNodeSnapshot, BlockListType } from "../../adapter/types";

/** Borrowed live node access; the controller retains identity and exclusive teardown ownership. */
export interface BlockEditorNodeApi {
  /** Stable ID retained even while the node is missing from the host. */
  readonly id: string;
  /**
   * Reads the currently resolved renderer type without caching another snapshot.
   *
   * @returns Current type, or undefined for a missing/outside/destroyed node.
   * @throws Propagates host read failures.
   */
  readonly type: string | undefined;

  /**
   * Reads the host's stable direct child list without traversing descendants.
   *
   * @returns Current child IDs, or undefined for a missing/outside/destroyed node.
   * @throws Propagates host read failures.
   */
  readonly childIds: readonly string[] | undefined;

  /**
   * Reads list decoration independently of the block's content renderer type.
   *
   * @returns Current list mode, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  readonly listType: BlockListType | undefined;

  /**
   * Reads the current whole-block checkbox state.
   *
   * @returns Host checkbox value, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  readonly checked: boolean | undefined;

  /**
   * Reads the current collapse state without changing selection or mounting children.
   *
   * @returns Host collapse value, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  readonly collapsed: boolean | undefined;

  /**
   * Reads the resolved CSS background color or expression supplied by the host.
   *
   * @returns Current CSS background value, or undefined for a default background or an unavailable node.
   * @throws Propagates host read failures.
   */
  readonly color: string | undefined;

  /**
   * Reads the immutable host snapshot for React external-store comparison.
   *
   * The stable node object is not itself a snapshot. No object is allocated here;
   * missing nodes can later reappear through synchronization or undo.
   * The host must reuse the snapshot reference until its state changes, then
   * replace it before notifying subscribers. React compares this reference with
   * Object.is; retaining the node object's identity does not suppress updates.
   *
   * @returns The host's cached snapshot, or undefined when missing/outside/destroyed.
   * @throws Propagates host read failures.
   */
  getSnapshot(): BlockEditorNodeSnapshot | undefined;

  /**
   * Observes this ID without creating a second store or one subscription per getter.
   *
   * The owner also releases retained subscriptions during destruction. A caller's
   * disposer remains safe after that cleanup and only removes its own subscription.
   *
   * @param listener - Callback that rereads the snapshot after a host notification.
   * @returns Idempotent disposer releasing this addressed host subscription.
   * @throws If destroyed or delegated subscription setup fails.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Changes the list mode through the host without recomputing sibling numbers.
   *
   * Checkbox state and unrelated fields are preserved. Shortcuts and higher-level
   * behaviors own any combined changes, such as resetting checked on conversion.
   *
   * @param listType - Built-in list mode, or null to remove the list decoration.
   * @returns The host update has completed without storing an ordinal on this node.
   * @throws If destroyed/unavailable or the host rejects the list mode or update.
   */
  setListType(listType: BlockListType | null): void;

  /**
   * Changes checkbox state using the host's current validation and undo policy.
   *
   * @param checked - New whole-block checkbox value.
   * @returns The host update has completed; no local optimistic snapshot is stored.
   * @throws If destroyed/unavailable or the host rejects the update.
   */
  setChecked(checked: boolean): void;

  /**
   * Changes collapse state without owning a separate document or undo manager.
   *
   * @param collapsed - Whether the host should mark this block collapsed.
   * @returns The host update has completed; rendering policy remains with its consumer.
   * @throws If destroyed/unavailable or the host rejects the update.
   */
  setCollapsed(collapsed: boolean): void;

  /**
   * Changes the block background through the host's supported presentation fields.
   *
   * @param color - Host-supported CSS background value, or null to remove the local background override.
   * @returns The host update has completed without changing other presentation fields.
   * @throws If destroyed/unavailable or the host rejects the color or update.
   */
  setColor(color: string | null): void;
}
