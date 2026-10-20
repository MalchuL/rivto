import type { BlockEditorAdapter } from "../adapter/types";
import { BlockEditorNode } from "./blocks/block-editor-node";

/** Identity token for one mounted root, independent of later attachments. */
interface BlockEditorAttachment {
  readonly root: HTMLElement;
}

/** Owns the DOM attachment of one block editor without owning its adapter. */
export class BlockEditorController {
  private attachment: BlockEditorAttachment | undefined;
  private destroyed = false;
  // shortcut: Retain visited IDs for this controller lifetime; add idle eviction if long-session churn warrants it.
  private readonly nodes = new Map<string, BlockEditorNode>();

  /**
   * Retains the limited capabilities of one region without subscribing or attaching DOM.
   *
   * @param adapter - Borrowed live data and presentation sources for this occurrence.
   */
  constructor(readonly adapter: BlockEditorAdapter) {}

  /**
   * Reuses one live object per requested ID without reading or copying host snapshots.
   *
   * Missing IDs still receive objects so consumers can observe later restoration.
   * Updates, selection, root reordering, and detach/attach retain the same objects.
   *
   * @param blockId - Stable identity inside this controller's adapter occurrence.
   * @returns Cached node owned by this controller and borrowed by the caller.
   * @throws If this controller has been destroyed.
   */
  getNode(blockId: string): BlockEditorNode {
    if (this.destroyed) {
      throw new Error("BlockEditorController is destroyed");
    }
    let node = this.nodes.get(blockId);
    if (!node) {
      node = new BlockEditorNode(blockId, this.adapter.blocks);
      this.nodes.set(blockId, node);
    }
    return node;
  }

  /**
   * Connects one committed block editor root to this controller.
   *
   * Detach permits a later attachment; an old disposer cannot clear a newer one.
   * This rendering slice installs no input handlers or host registrations.
   *
   * @param root - Mounted root owned by this block editor occurrence.
   * @returns Idempotent disposer detaching only this attachment.
   * @throws If destroyed or another root is still attached.
   */
  attach(root: HTMLElement): () => void {
    if (this.destroyed) {
      throw new Error("BlockEditorController is destroyed");
    }
    if (this.attachment) {
      throw new Error("BlockEditorController already has an attached root");
    }
    const attachment = { root };
    this.attachment = attachment;
    return () => {
      if (this.attachment === attachment) {
        this.attachment = undefined;
      }
    };
  }

  /**
   * Reads this occurrence's currently attached DOM root.
   *
   * @returns Mounted root, or null before attach, after detach, or after destruction.
   */
  getRoot(): HTMLElement | null {
    return this.attachment?.root ?? null;
  }

  /**
   * Permanently detaches this controller and releases owned nodes without destroying the adapter.
   *
   * @returns Attachment and node cache are cleared and later attach/getNode calls are
   * rejected; every node cleanup is attempted and repeated destruction is safe.
   * @throws AggregateError when one or more node cleanups fail.
   */
  destroy(): void {
    this.destroyed = true;
    this.attachment = undefined;
    const errors: unknown[] = [];
    for (const node of this.nodes.values()) {
      try {
        node.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    this.nodes.clear();
    if (errors.length) {
      throw new AggregateError(errors, "Failed to destroy block editor nodes");
    }
  }
}
