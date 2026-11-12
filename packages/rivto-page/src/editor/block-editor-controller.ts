import { BlockPointerOwnership } from "./pointer/block-pointer-ownership";
import { BlockLayoutRegions } from "../presentation/components/block-layout/block-layout-regions";
import { BlockKeyboard } from "./keyboard/block-keyboard";
import { BlockWrapperRegistry } from "../presentation/components/block-wrapper/block-wrapper-registry";
import { BlockDropTargets } from "./drag-and-drop/block-drop-targets";
import type { BlockEditorApi } from "./block-editor-api";
import type { BlockRenderer } from "../presentation/renderers/types";
import { BlockEditorExtensions } from "./extensions/block-editor-extensions";
import { BlockEditorEvents } from "./events/block-editor-events";
import { BlockSlotRegistry } from "../presentation/slots/block-slot-registry";
import { BlockRendererRegistry } from "../presentation/renderers/block-renderer-registry";
import type { BlockEditorAdapter } from "../adapter/types";
import type { BlockEditorNodeApi } from "./blocks/block-editor-node-api";
import { BlockEditorNode } from "./blocks/block-editor-node";

/** Identity token for one mounted root, independent of later attachments. */
interface BlockEditorAttachment {
  readonly root: HTMLElement;
  /** Releases native event listeners installed for this exact attachment. */
  readonly detachEvents: () => void;
}

/** Data source borrowed by one independently configurable block editor instance. */
export interface BlockEditorOptions {
  /** Stable data adapter; its lifetime and document resources remain with the host. */
  readonly adapter: BlockEditorAdapter;
  /** Content component for unregistered types; omission leaves their content area empty. */
  readonly fallbackRenderer?: BlockRenderer;
}

/** Owns block nodes, feature registrations, and one replaceable DOM attachment. */
export class BlockEditorController implements BlockEditorApi {
  /** Mounted layout ownership, released by refs and finally by this controller. */
  readonly regions = new BlockLayoutRegions();
  /** Borrowed data access and host selection; this editor never destroys the adapter. */
  readonly adapter: BlockEditorAdapter;
  /** Feature setup and cleanup ownership, independent of view attachment. */
  readonly extensions: BlockEditorExtensions;
  /** Editor-owned presentation contributions with stable registration identities. */
  readonly slots: BlockSlotRegistry;
  /** Live host-supplied content components, separate from persisted block definitions. */
  readonly renderers: BlockRendererRegistry;
  /** Ordered host decorators retained independently of view attachment and DnD placement. */
  readonly wrappers: BlockWrapperRegistry;
  /** Typed native input registrations and observers of focus crossing the attached editor subtree. */
  readonly events: BlockEditorEvents;
  /** Semantic bindings and physical key state owned by this editor. */
  readonly keyboard: BlockKeyboard;
  /** Exclusive pointer reservation shared by selection and drag extensions. */
  readonly pointer = new BlockPointerOwnership();
  /** Explicit mounted regions and geometry-only destination lookup. */
  readonly dropTargets: BlockDropTargets;
  /** Current DOM root and its input/focus-listener cleanup; undefined while detached. Identity prevents stale disposers from detaching a newer root. */
  private attachment: BlockEditorAttachment | undefined;
  /** Permanent lifecycle flag set when destruction begins; rejects later attachment and node lookup, independently of view detachment. */
  private destroyed = false;
  // shortcut: Retain visited IDs for this controller lifetime; add idle eviction if long-session churn warrants it.
  private readonly nodes = new Map<string, BlockEditorNode>();

  /**
   * Creates editor-owned managers without reading or subscribing to host data, or attaching DOM.
   *
   * The host creates this instance outside React rendering and destroys it when
   * its editing session ends. Views borrow it; unmounting a view only detaches DOM.
   *
   * @param options - Borrowed data adapter for this independently configured instance.
   * @param options.adapter - Live data source retained without taking ownership.
   * @param options.fallbackRenderer - Stable content component for unregistered types, if supplied.
   */
  constructor({ adapter, fallbackRenderer }: BlockEditorOptions) {
    this.adapter = adapter;
    this.extensions = new BlockEditorExtensions(this);
    this.slots = new BlockSlotRegistry(this.extensions);
    this.renderers = new BlockRendererRegistry(this.extensions, fallbackRenderer);
    this.wrappers = new BlockWrapperRegistry(this.extensions);
    this.events = new BlockEditorEvents(this.extensions);
    this.keyboard = new BlockKeyboard(this.events, this.extensions);
    this.dropTargets = new BlockDropTargets(
      this.extensions,
      adapter.blocks,
      () => this.getRoot(),
      this.regions,
    );
  }

  /**
   * Reuses one live object per requested ID without reading or copying host snapshots.
   *
   * Missing IDs still receive objects so consumers can observe later restoration.
   * Updates, selection, display-list reordering, and detach/attach retain the same objects.
   *
   * @param blockId - Stable identity inside this controller's adapter occurrence.
   * @returns Cached node owned by this controller and borrowed by the caller.
   * @throws If this controller has been destroyed.
   */
  getNode(blockId: string): BlockEditorNodeApi {
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
   * Input and focus listeners belong to this attachment. Registrations and nodes survive
   * detach/attach; input commands and host data are not created by attachment.
   * After publishing the root, attachment reports focus already inside it (such
   * as autoFocus during React commit). Observer failure rolls back the attachment.
   *
   * @param root - Mounted root owned by this block editor occurrence.
   * @returns Idempotent disposer detaching only this attachment.
   * @throws If destroyed, another root is still attached, or initial focus observers fail.
   */
  attach(root: HTMLElement): () => void {
    if (this.destroyed) {
      throw new Error("BlockEditorController is destroyed");
    }
    if (this.attachment) {
      throw new Error("BlockEditorController already has an attached root");
    }
    const attachment = { root, detachEvents: this.events.attach(root) };
    this.attachment = attachment;
    try {
      this.events.notifyInitialFocus(root);
    } catch (error) {
      this.attachment = undefined;
      try {
        attachment.detachEvents();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Initial focus and attachment cleanup failed",
        );
      }
      throw error;
    }
    return () => {
      if (this.attachment === attachment) {
        this.attachment = undefined;
        attachment.detachEvents();
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
   * Permanently detaches this editor and releases extensions, registrations, and nodes.
   *
   * @returns Attachment and node cache are cleared and later attach/getNode calls are
   * rejected; every cleanup is attempted and repeated destruction is safe. The
   * host adapter and document are not destroyed. Unmount the view before ending
   * the editing session; React owns removal of rendered DOM.
   * @throws If called during extension setup, or AggregateError when cleanups fail.
   */
  destroy(): void {
    this.extensions.assertCanDestroy();
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const errors: unknown[] = [];
    try {
      this.attachment?.detachEvents();
    } catch (error) {
      errors.push(error);
    }
    this.attachment = undefined;
    try {
      this.keyboard.destroy();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.extensions.destroy();
    } catch (error) {
      errors.push(error);
    }
    for (const node of this.nodes.values()) {
      try {
        node.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    this.nodes.clear();
    this.regions.destroy();
    if (errors.length) {
      throw new AggregateError(errors, "Failed to destroy block editor resources");
    }
  }
}
