import type { BlockSelectionSnapshot } from "../editor/selection/types";
/** Built-in list modes interpreted by Page, independent of the host's storage schema. */
export type BlockListType =
  "list" | "checkbox" | "numbered_list" | "start_numbered_list" | "continue_numbered_list";

/**
 * Describes the structure Page needs to render a block without knowing its storage model.
 *
 * Hosts may return their existing snapshots structurally, without copying them.
 * Content, properties, schemas, and plugin data belong to their concrete renderers.
 *
 * Repeated reads of unchanged state must return the same snapshot object by
 * reference. React's useSyncExternalStore compares snapshots with Object.is;
 * publishing a change requires a new immutable snapshot before notifying listeners.
 * Mutating the old object can hide updates, while allocating on every read can
 * cause repeated renders. The ID-bound BlockEditorNode remains the same object
 * across these snapshot replacements for its controller lifetime.
 */
export interface BlockEditorNodeSnapshot {
  /** Stable identity within the adapter. */
  readonly id: string;
  /** Lookup key for the host's live renderer registry. */
  readonly type: string;
  /** Stable ordered direct child IDs; descendants are read separately. */
  readonly childIds: readonly string[];
  /** List mode, separate from the content renderer type; omitted for an undecorated block. */
  readonly listType?: BlockListType;
  /** Whole-block checkbox state; omitted when the host supplies no checkbox state. */
  readonly checked?: boolean;
  /** Persisted collapse state; omitted when the host supplies no collapse state. */
  readonly collapsed?: boolean;
  /** Resolved CSS background color or expression supplied by the host; omitted for the default background. */
  readonly color?: string;
}

/** Presentation changes delegated to the host's validation and transaction policy. */
export interface BlockEditorNodePatch {
  /** New list mode, null to remove it; omission preserves the mode and other fields. */
  readonly listType?: BlockListType | null;
  /** New checkbox state; omission preserves its current value. */
  readonly checked?: boolean;
  /** New collapse state; omission preserves its current value. */
  readonly collapsed?: boolean;
  /** Resolved CSS background color or expression, null to remove the override; omission preserves the value. */
  readonly color?: string | null;
}

/** Host-selected display list and addressed, nonrecursive node access. */
export interface BlockEditorBlocks {
  /**
   * Reads actual document roots accessible as a drop destination in this occurrence.
   *
   * This list is independent of display IDs. Return a stable immutable array until
   * root order changes; an empty array permits insertion into an empty document.
   *
   * @returns Canonical root IDs, or undefined when the root destination is inaccessible.
   */
  getRootIds(): readonly string[] | undefined;

  /**
   * Resolves actual hierarchy independently of viewport and display-list membership.
   *
   * @param blockId - Accessible block identity, including an unmounted descendant.
   * @returns Its actual parent ID, or undefined for a root, missing, or inaccessible block.
   */
  getParentId(blockId: string): string | undefined;
  /**
   * Reads the ordered blocks to display without requiring a common parent or owner.
   *
   * IDs must be unique within this list. Each node supplies its real descendants
   * through childIds; the list does not create or change document hierarchy.
   * Repeated reads must return the same array reference until its contents or order
   * change. Publish a new immutable array before notifying list subscribers;
   * useSyncExternalStore compares references with Object.is. Empty means no blocks.
   *
   * @returns Cached, read-only display IDs selected by the host.
   */
  getBlockIds(): readonly string[];
  /**
   * Observes display-list and accessible canonical-root changes independently of node edits.
   *
   * Notify when either getBlockIds or getRootIds changes, including canonical root
   * reorderings hidden by a projected display list. Both snapshots must be published
   * before notifying; unchanged arrays retain identity to avoid unrelated renders.
   *
   * @param listener - Callback that rereads IDs after their contents or order change.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribeBlockIds(listener: () => void): () => void;
  /**
   * Reads a block's own fields and direct child IDs through the host adapter.
   *
   * Snapshots and child ID arrays retain identity until their corresponding data
   * changes. Returned values are detached and must be treated as read-only.
   * A subscription notification prompts a reread; React detects the change by
   * comparing the returned snapshot reference, not by inspecting its fields.
   *
   * @param blockId - Stable block identity to resolve.
   * @returns Cached node, or undefined when missing or inaccessible through the adapter.
   */
  getBlockNode(blockId: string): BlockEditorNodeSnapshot | undefined;
  /**
   * Observes one node's fields or direct child order, excluding descendant edits.
   *
   * @param blockId - Stable block identity, including a currently missing node.
   * @param listener - Callback notified after that node's snapshot changes.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribeBlockNode(blockId: string, listener: () => void): () => void;
  /**
   * Applies presentation changes through the host's existing mutation boundary.
   *
   * Source identity, access permissions, supported fields and values must be
   * checked before writing. The host owns transaction and undo capture policy;
   * subscribers observe the resulting cached snapshot, not an optimistic copy.
   *
   * @param blockId - Existing block identity accessible through the adapter.
   * @param patch - Fields to change; omitted fields remain unchanged.
   * @returns Changes have been applied and the host's notifications delivered.
   * @throws If the block is missing/outside, changes are unsupported or invalid,
   * or delegated validation/transaction execution fails.
   */
  updateBlockNode(blockId: string, patch: BlockEditorNodePatch): void;
}

/** Per-block selection membership backed by the host's existing selection store. */
export interface BlockEditorSelection {
  /**
   * Lets the host reserve pointer input for interactions outside block selection.
   *
   * @param event - Native pointer or click event starting a selection operation.
   * @returns False when a host gesture owns this input; omission permits selection.
   */
  canStartSelection?(event: MouseEvent): boolean;
  /**
   * Reports whether a host command is restoring native selection asynchronously.
   *
   * Native selectionchange must not overwrite the command's authoritative model
   * selection during that interval. Omission means no host restoration is pending.
   * New input still captures its live caret before mutation.
   *
   * @returns True while host-owned restoration owns the model selection.
   */
  isNativeSelectionSuspended?(): boolean;
  /**
   * Reads current detached block/text coverage.
   *
   * @returns Stable current snapshot, or undefined without selection.
   */
  get(): BlockSelectionSnapshot | undefined;
  /**
   * Publishes coverage through host-owned selection storage.
   *
   * @param selection - Directed ranges in visible canonical order.
   * @returns Host state and addressed membership subscribers have been updated.
   */
  set(selection: BlockSelectionSnapshot): void;
  /**
   * Clears host-owned block/text coverage.
   *
   * @returns No block/text selection remains.
   */
  clear(): void;
  /**
   * Reads selectable IDs respecting the current display list and collapsed nodes.
   *
   * Viewport windowing never removes IDs from this order; only model hierarchy
   * and collapse policy affect membership.
   *
   * @returns Stable ordered IDs until hierarchy or collapse visibility changes.
   */
  getSelectableBlockIds(): readonly string[];
  /**
   * Reads text length without exposing persisted content or model nodes.
   *
   * @param blockId - Block identity accessible through this occurrence.
   * @returns UTF-16 text length (including zero for empty text), or undefined for
   * contentless, missing or inaccessible blocks. This classification must not
   * depend on whether the block currently has mounted DOM.
   */
  getTextLength(blockId: string): number | undefined;

  /**
   * Reads whether a whole block is selected through the host adapter.
   *
   * @param blockId - Stable block identity; missing or outside blocks are unselected.
   * @returns Whole-block membership, excluding a caret or partial text selection.
   */
  isBlockSelected(blockId: string): boolean;
  /**
   * Observes changes to one block's whole-block membership.
   *
   * @param blockId - Stable block identity to observe.
   * @param listener - Callback notified when that block's selected boolean changes.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribeBlock(blockId: string, listener: () => void): () => void;
}

/**
 * Supplies the autonomous rendering slice for a host-selected list of blocks.
 *
 * The host owns data; the block editor owns presentation registrations. All reads are synchronous and side-effect
 * free, including server reads; subscriptions notify after snapshots change.
 * The display list need not share a parent or owner. Node IDs are stable and unique;
 * child relationships remain acyclic. The host controls access through the adapter.
 * Further editing capabilities will be added with their consuming interactions.
 * No editor, panel, document, or owner backlink belongs to this contract.
 */
export interface BlockEditorAdapter {
  readonly blocks: BlockEditorBlocks;
  readonly selection: BlockEditorSelection;
}
