import type { BlockEditorAdapter } from "../adapter/types";

/** Owns the DOM attachment of one block editor without owning its adapter. */
export class BlockEditorController {
  private attachment: { readonly root: HTMLElement } | undefined;
  private destroyed = false;

  /**
   * Retains the limited capabilities of one region without subscribing or attaching DOM.
   *
   * @param adapter - Borrowed live data and presentation sources for this occurrence.
   */
  constructor(readonly adapter: BlockEditorAdapter) {}

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
   * Permanently detaches this controller without destroying borrowed capabilities.
   *
   * @returns The attachment is cleared and later attach calls are rejected; repeats are safe.
   */
  destroy(): void {
    this.destroyed = true;
    this.attachment = undefined;
  }
}
