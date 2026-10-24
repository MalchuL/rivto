import type { BlockEditorNodeApi } from "./block-editor-node-api";
import type {
  BlockEditorBlocks,
  BlockEditorNodePatch,
  BlockEditorNodeSnapshot,
  BlockListType,
} from "../../adapter/types";

/** Stable ID-bound access to live host snapshots, commands, and addressed subscriptions. */
export class BlockEditorNode implements BlockEditorNodeApi {
  private blocks: BlockEditorBlocks | undefined;
  private subscriptions: Set<() => void> | undefined;

  /**
   * Binds a node to a host source without reading, copying data, or subscribing.
   *
   * Obtain cached instances through BlockEditorController.getNode. The controller
   * owns their destruction; renderers and hooks borrow them.
   *
   * @param id - Stable identity, including a currently missing node to observe.
   * @param blocks - Bounded host source retained until this node is destroyed.
   */
  constructor(
    readonly id: string,
    blocks: BlockEditorBlocks,
  ) {
    this.blocks = blocks;
  }

  /**
   * Reads the currently resolved renderer type without caching another snapshot.
   *
   * @returns Current type, or undefined for a missing/outside/destroyed node.
   * @throws Propagates host read failures.
   */
  get type(): string | undefined {
    return this.getSnapshot()?.type;
  }

  /**
   * Reads the host's stable direct child list without traversing descendants.
   *
   * @returns Current child IDs, or undefined for a missing/outside/destroyed node.
   * @throws Propagates host read failures.
   */
  get childIds(): readonly string[] | undefined {
    return this.getSnapshot()?.childIds;
  }

  /**
   * Reads list decoration independently of the block's content renderer type.
   *
   * @returns Current list mode, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  get listType(): BlockListType | undefined {
    return this.getSnapshot()?.listType;
  }

  /**
   * Reads the current whole-block checkbox state.
   *
   * @returns Host checkbox value, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  get checked(): boolean | undefined {
    return this.getSnapshot()?.checked;
  }

  /**
   * Reads the current collapse state without changing selection or mounting children.
   *
   * @returns Host collapse value, or undefined when absent or unavailable.
   * @throws Propagates host read failures.
   */
  get collapsed(): boolean | undefined {
    return this.getSnapshot()?.collapsed;
  }

  /**
   * Reads the resolved CSS background color or expression supplied by the host.
   *
   * @returns Current CSS background value, or undefined for a default background or an unavailable node.
   * @throws Propagates host read failures.
   */
  get color(): string | undefined {
    return this.getSnapshot()?.color;
  }

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
  getSnapshot(): BlockEditorNodeSnapshot | undefined {
    return this.blocks?.getBlockNode(this.id);
  }

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
  subscribe(listener: () => void): () => void {
    if (!this.blocks) {
      throw new Error("BlockEditorNode is destroyed");
    }
    const subscriptions = (this.subscriptions ??= new Set());
    let active = true;
    const release = this.blocks.subscribeBlockNode(this.id, () => {
      if (active) {
        listener();
      }
    });
    const dispose = () => {
      if (!active) {
        return;
      }
      active = false;
      subscriptions.delete(dispose);
      release();
    };
    subscriptions.add(dispose);
    return dispose;
  }

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
  setListType(listType: BlockListType | null): void {
    this.update({ listType });
  }

  /**
   * Changes checkbox state using the host's current validation and undo policy.
   *
   * @param checked - New whole-block checkbox value.
   * @returns The host update has completed; no local optimistic snapshot is stored.
   * @throws If destroyed/unavailable or the host rejects the update.
   */
  setChecked(checked: boolean): void {
    this.update({ checked });
  }

  /**
   * Changes collapse state without owning a separate document or undo manager.
   *
   * @param collapsed - Whether the host should mark this block collapsed.
   * @returns The host update has completed; rendering policy remains with its consumer.
   * @throws If destroyed/unavailable or the host rejects the update.
   */
  setCollapsed(collapsed: boolean): void {
    this.update({ collapsed });
  }

  /**
   * Changes the block background through the host's supported presentation fields.
   *
   * @param color - Host-supported CSS background value, or null to remove the local background override.
   * @returns The host update has completed without changing other presentation fields.
   * @throws If destroyed/unavailable or the host rejects the color or update.
   */
  setColor(color: string | null): void {
    this.update({ color });
  }

  /**
   * Invalidates this borrowed node and attempts to release every retained subscription.
   *
   * Only the owning controller should call this method. Host references are dropped
   * before cleanup, so retained node references cannot read or mutate another lifetime.
   *
   * @returns The node is inactive and all subscription disposers have been attempted.
   * @throws AggregateError when one or more delegated disposers fail.
   */
  destroy(): void {
    this.blocks = undefined;
    const subscriptions = this.subscriptions;
    this.subscriptions = undefined;
    if (!subscriptions?.size) {
      return;
    }
    const errors: unknown[] = [];
    for (const dispose of subscriptions) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Failed to release block node subscriptions");
    }
  }

  /**
   * Delegates one presentation patch after checking this node's current availability.
   *
   * @param patch - Fields interpreted and validated by the host mutation boundary.
   * @returns The host has applied the patch according to its transaction policy.
   * @throws If destroyed/unavailable or delegated reads/writes fail.
   */
  private update(patch: BlockEditorNodePatch): void {
    if (!this.blocks) {
      throw new Error("BlockEditorNode is destroyed");
    }
    if (!this.getSnapshot()) {
      throw new Error(`Block ${this.id} is unavailable`);
    }
    this.blocks.updateBlockNode(this.id, patch);
  }
}
