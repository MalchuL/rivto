import type { ComponentType } from "react";

/**
 * Describes the structure Page needs to render a block without knowing its storage model.
 *
 * Hosts may return their existing snapshots structurally, without copying them.
 * Content, properties, schemas, and plugin data belong to their concrete renderers.
 */
export interface BlockEditorNode {
  /** Stable identity within this editing region. */
  readonly id: string;
  /** Lookup key for the host's live renderer registry. */
  readonly type: string;
  /** Stable ordered direct child IDs; descendants are read separately. */
  readonly childIds: readonly string[];
}

/** Detached root order and availability of one block editing region. */
export interface BlockEditorRegionSnapshot {
  /** Missing owners must not be interpreted as available empty regions. */
  readonly status: "available" | "missing";
  /** Unique ordered roots; descendants are supplied by their own node snapshots. */
  readonly blockIds: readonly string[];
}

/** Live root boundaries, independent of changes to individual block contents. */
export interface BlockEditorRegion {
  /**
   * Reads the current region availability and root order.
   *
   * @returns Cached snapshot whose identity changes only with status or root order.
   */
  getSnapshot(): BlockEditorRegionSnapshot;
  /**
   * Observes availability and root-order changes without observing block content.
   *
   * @param listener - Callback that rereads the snapshot after a change.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribe(listener: () => void): () => void;
}

/** Addressed, nonrecursive reads constrained to the adapter's region. */
export interface BlockEditorBlocks {
  /**
   * Reads a block's own fields and direct child IDs within this region.
   *
   * Snapshots and child ID arrays retain identity until their corresponding data
   * changes. Returned values are detached and must be treated as read-only.
   *
   * @param blockId - Stable block identity to resolve.
   * @returns Cached node, or undefined when missing or outside the region.
   */
  getBlockNode(blockId: string): BlockEditorNode | undefined;
  /**
   * Observes one node's fields or direct child order, excluding descendant edits.
   *
   * @param blockId - Stable block identity, including a currently missing node.
   * @param listener - Callback notified after that node's snapshot changes.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribeBlockNode(blockId: string, listener: () => void): () => void;
}

/** Per-block selection membership backed by the host's existing selection store. */
export interface BlockEditorSelection {
  /**
   * Reads whether a whole block is selected in this region.
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

/** Content renderer inputs, compatible with the existing host renderer contract. */
export interface BlockRendererProps {
  /** Stable identity resolved through the surrounding limited block context. */
  readonly blockId: string;
}

/** Content-only renderer; the Page package supplies the shell and descendants. */
export type BlockRenderer = ComponentType<BlockRendererProps>;

/** Observable renderer lookup; registration remains with the host. */
export interface BlockEditorRenderers {
  /**
   * Looks up content presentation without creating a component on each read.
   *
   * @param type - Persisted block type to resolve.
   * @returns Stable renderer identity, configured fallback, or undefined for no content.
   */
  get(type: string): BlockRenderer | undefined;
  /**
   * Observes renderer registration and removal.
   *
   * @param listener - Callback that rereads lookup results after a registry change.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Supplies the autonomous rendering slice for one block editing region.
 *
 * The host owns data and registries. All reads are synchronous and side-effect
 * free, including server reads; subscriptions notify after snapshots change.
 * Nodes form an acyclic forest with unique IDs, already bounded by the adapter.
 * Further editing capabilities will be added with their consuming interactions.
 * No editor, panel, document, or owner backlink belongs to this contract.
 */
export interface BlockEditorAdapter {
  readonly region: BlockEditorRegion;
  readonly blocks: BlockEditorBlocks;
  readonly selection: BlockEditorSelection;
  readonly renderers: BlockEditorRenderers;
}
