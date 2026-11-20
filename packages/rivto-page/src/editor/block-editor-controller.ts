import { BlockPointerOwnership } from "./pointer/block-pointer-ownership";
import { BlockLayoutRegions } from "../presentation/components/block-layout/block-layout-regions";
import { BlockVirtualizationRegistry } from "./virtualization/block-virtualization-registry";
import { BlockKeyboard } from "./keyboard/block-keyboard";
import { BlockWrapperRegistry } from "../presentation/components/block-wrapper/block-wrapper-registry";
import { BlockDropTargets } from "./drag-and-drop/block-drop-targets";
import type { BlockEditorApi } from "./types";
import { BlockEditorExtensions } from "./extensions/block-editor-extensions";
import { BlockEditorEvents } from "./events/block-editor-events";
import { BlockSlotRegistry } from "../presentation/slots/block-slot-registry";
import { BlockRendererRegistry } from "../presentation/renderers/block-renderer-registry";
import type { BlockEditorAdapter } from "../adapter/types";
import type {
  BlockEditorAttachment,
  BlockEditorOptions,
  PageInputRoot,
  PageViewInputRoot,
} from "./types";
import type { BlockEditorNodeApi } from "./blocks/block-editor-node-api";
import { BlockEditorNode } from "./blocks/block-editor-node";
import { BlockDOMSelection } from "./selection/block-dom-selection";
import type { BlockBrowserSelectionOwner } from "./selection/types";
import { BlockPointerHitTest } from "./selection/block-pointer-hit-test";

/** Owns block nodes, feature registrations, and one replaceable DOM attachment. */
export class BlockEditorController<
  CustomEvents extends object = object,
> implements BlockEditorApi<CustomEvents> {
  /** Mounted layout ownership, released by refs and finally by this controller. */
  readonly regions = new BlockLayoutRegions();
  readonly virtualization = new BlockVirtualizationRegistry();
  /** Borrowed data access and host selection; this editor never destroys the adapter. */
  readonly adapter: BlockEditorAdapter;
  /** Feature setup and cleanup ownership, independent of view attachment. */
  readonly extensions: BlockEditorExtensions<CustomEvents>;
  /** Editor-owned presentation contributions with stable registration identities. */
  readonly slots: BlockSlotRegistry;
  /** Live host-supplied content components, separate from persisted block definitions. */
  readonly renderers: BlockRendererRegistry;
  /** Ordered host decorators retained independently of view attachment and DnD placement. */
  readonly wrappers: BlockWrapperRegistry;
  /** Typed native input registrations and observers of focus crossing the attached editor subtree. */
  readonly events: BlockEditorEvents<CustomEvents>;
  /** Browser selection conversion owned by this occurrence. */
  readonly browserSelection: BlockBrowserSelectionOwner;
  /** Semantic bindings and physical key state owned by this editor. */
  readonly keyboard: BlockKeyboard;
  /** Exclusive pointer reservation shared by selection and drag extensions. */
  readonly pointer = new BlockPointerOwnership();
  /** Explicit mounted regions and geometry-only destination lookup. */
  readonly dropTargets: BlockDropTargets;
  /** Current borrowed Root and its input/focus-listener cleanup; undefined while detached. Identity prevents stale disposers from detaching a newer occurrence. */
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
    this.events = new BlockEditorEvents<CustomEvents>(this.extensions);
    this.browserSelection = new BlockDOMSelection(adapter.selection, this.virtualization);
    this.keyboard = new BlockKeyboard(this.events, this.extensions);
    this.dropTargets = new BlockDropTargets(
      this.extensions,
      adapter.blocks,
      () => this.attachment,
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
   * Connects one committed block editor occurrence to this controller.
   *
   * Detach permits a later attachment; an old disposer cannot clear a newer one.
   * Input and focus listeners belong to this attachment. Registrations and nodes survive
   * detach/attach; input commands and host data are not created by attachment.
   * After publishing the root, attachment reports focus already inside it (such
   * as autoFocus during React commit). Observer failure rolls back the attachment.
   * The Root remains owned by its mounting host and is not detached here.
   *
   * @param inputRoot - Host-owned capability for the mounted occurrence.
   * @returns Idempotent disposer detaching only this attachment.
   * @throws If destroyed, another root is still attached, the supplied root is
   * inactive, or initial focus observers fail.
   */
  attach(inputRoot: PageInputRoot): () => void {
    if (this.destroyed) {
      throw new Error("BlockEditorController is destroyed");
    }
    if (this.attachment) {
      throw new Error("BlockEditorController already has an attached root");
    }
    if (!inputRoot.isAttached()) {
      throw new Error("Input root is not attached");
    }
    let detachSelection: (() => void) | undefined;
    let detachEvents: () => void;
    try {
      detachSelection = this.browserSelection.attach(
        new BlockPointerHitTest(inputRoot, this.regions),
        inputRoot,
      );
      detachEvents = this.events.attach(inputRoot);
    } catch (error) {
      detachSelection?.();
      throw error;
    }
    const attachment: BlockEditorAttachment = {
      inputRoot,
      detachEvents,
      detachSelection,
      detachVirtualization: () => {},
    };
    this.publishAttachment(attachment);
    return () => {
      if (this.attachment === attachment) {
        this.attachment = undefined;
        this.releaseAttachment(attachment);
      }
    };
  }

  /**
   * Reads the Root borrowed by this controller's current attachment.
   *
   * The Root may already be detached while its owning host is withdrawing the
   * Page attachment. Its identity still describes the original surface.
   *
   * @returns The borrowed Root, or undefined before attachment or after release.
   */
  get inputRoot(): PageViewInputRoot | undefined {
    return this.attachment?.inputRoot;
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
      if (this.attachment) {
        this.releaseAttachment(this.attachment);
      }
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
    try {
      this.regions.destroy();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.virtualization.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Failed to destroy block editor resources");
    }
  }
  /**
   * Publishes an attachment, connects virtualized views, and reconciles initial focus.
   *
   * Initial observation can synchronously end the attachment. A failed setup
   * releases its own resources without clearing a newer attachment.
   *
   * @param attachment - Exact staged root and its already attached selection and events.
   * @returns The staged binding is installed and initial focus notification has completed.
   * @throws Propagates setup failures and aggregates failed attachment cleanup.
   */
  private publishAttachment(attachment: BlockEditorAttachment): void {
    this.attachment = attachment;
    try {
      const inputRoot = attachment.inputRoot;
      const region = inputRoot.captureRegionByIdentity(inputRoot.getElementIdentity());
      const identity = region?.getIdentity();
      if (!identity) {
        throw new Error("Block editor attachment ended during virtualization setup");
      }
      attachment.detachVirtualization = this.virtualization.bind(identity, inputRoot);
      if (this.attachment !== attachment || !attachment.inputRoot.isAttached()) {
        throw new Error("Block editor attachment ended during virtualization setup");
      }
      this.events.notifyInitialFocus(attachment.inputRoot);
    } catch (error) {
      if (this.attachment === attachment) {
        this.attachment = undefined;
      }
      try {
        this.releaseAttachment(attachment);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Initial focus and attachment cleanup failed",
        );
      }
      throw error;
    }
  }

  /**
   * Releases this occurrence's input and browser selection attachments.
   *
   * @param attachment - Exact root attachment being detached or rolled back.
   * @returns Selection ownership is withdrawn even when input cleanup fails.
   * @throws Propagates cleanup failures, aggregating multiple failures.
   */
  private releaseAttachment(attachment: BlockEditorAttachment): void {
    const errors: unknown[] = [];
    const cleanups = [
      attachment.detachVirtualization,
      attachment.detachEvents,
      attachment.detachSelection,
    ];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Block editor attachment cleanup failed");
    }
  }
}
