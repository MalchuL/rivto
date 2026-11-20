import type { PageCanvasAttachment, PageCanvasMount, PageNavigationRoot } from "./types";
import { BLOCK_ID_ATTRIBUTE } from "../../constants";
import {
  BlockNavigation,
  type BlockEditorAdapter,
  type BlockEditorController,
  type BlockBrowserSelectionApi,
} from "@chulane/rivto-page";
import { PANEL_SELECTOR } from "../../panels/panel-dom";

/**
 * Page-local bridge from DOM navigation and selection to unmounted root blocks.
 *
 * Each React block surface registers a controller. DOM event helpers use
 * the registration to mount a requested root before focusing its content and
 * preserve model-backed selections across gaps in the mounted outline.
 * The map stores no document data and is cleared on surface unmount.
 *
 * @module
 */

/** Page-local operations needed by commands that focus a currently unmounted root. */
export interface PageNavigationApi {
  /**
   * Captures a check for this exact navigation attachment.
   *
   * @returns A check that becomes false after removal or replacement, including on the same surface.
   * @throws Propagates attachment-check failures when the returned check runs.
   */
  captureAttachment(): () => boolean;
  /**
   * Checks whether this navigation still owns its mounted occurrence.
   *
   * @returns False after detachment or replacement by another controller.
   * @throws Propagates the borrowed Root's attachment check.
   */
  isAttached(): boolean;
  /** Borrowed model order and text metadata for Page DOM conversion. */
  readonly selection: PageNavigationSource["selection"];
  /** Occurrence-bound caret focus without selection attachment ownership. */
  readonly browserSelection: Pick<BlockBrowserSelectionApi, "focusBlock">;
  /**
   * Pins the top-level block containing each requested block in the virtualized
   * range. React synchronously mounts missing block DOM before callers resolve
   * selection endpoints. Unless scrolling is disabled, an offscreen target
   * scrolls into view; an already visible target retains its viewport position.
   *
   * @param blockIds - IDs of blocks to mount, including nested blocks.
   * @param options - Set scroll to false to mount without navigating the viewport.
   * @returns No value.
   */
  mountBlocks(blockIds: readonly string[], options?: PageMountOptions): void;
  /**
   * Pins the top-level block containing `blockId` and its previous or next
   * top-level block. Mounts their DOM and brings an offscreen neighbor into view
   * so keyboard navigation can cross the edge of the mounted range.
   *
   * @param blockId - ID of the block where keyboard navigation starts.
   * @param direction - -1 for the previous top-level block, 1 for the next.
   * @returns No value; the outline boundary has no neighboring root to mount.
   */
  mountAdjacentBlocks(blockId: string, direction: -1 | 1): void;
  /**
   * Pins the first or last top-level block, mounting its DOM and bringing it
   * into view if needed so focus can enter from another editor.
   *
   * @param direction - -1 to enter at the last block, 1 to enter at the first.
   * @returns No value; an empty document has no root to mount.
   */
  mountFirstOrLastBlock(direction: -1 | 1): void;
  /**
   * Disables browser scroll anchoring on the surface while a structural command
   * preserves its own viewport anchor. Overlapping suspensions share the same
   * saved overflow-anchor style, restored when the last suspension is released.
   *
   * @returns An idempotent release function for this suspension.
   */
  suspendScrollAdjustments(): () => void;
}

/** Controls whether mounting a virtual selection endpoint also navigates to it. */
export interface PageMountOptions {
  /** False preserves the current viewport while mounting the requested roots. */
  readonly scroll?: boolean;
}

/** Addressed reads needed for navigation; registration and selection writes stay with their owners. */
interface PageNavigationSource {
  readonly blocks: Pick<BlockEditorAdapter["blocks"], "getBlockIds" | "getParentId">;
  readonly selection: Pick<
    BlockEditorAdapter["selection"],
    "getSelectableBlockIds" | "getTextLength"
  >;
}

/** Panel-owned navigation bridge; the Page view retains ownership of its virtualizer. */
export class PageNavigationController extends BlockNavigation implements PageNavigationApi {
  private static readonly controllers = new WeakMap<object, PageNavigationController>();
  private occurrence: PageNavigationRoot | undefined;
  private canvasAttachment: PageCanvasAttachment | undefined;
  private suspensions = 0;
  private releaseScrollAnchor?: () => void;
  /** Identity distinguishes remounts even when React reuses the same DOM root. */
  private attachment = {};

  /**
   * Borrows addressed hierarchy and the panel's canonical selection projection.
   *
   * @param adapter - Existing Page adapter; neither model nor selection is copied or destroyed.
   * @param browserSelection - Borrowed occurrence-bound caret focus capability.
   * @param virtualization - Page-owned lookup for the current mounted windowing view.
   */
  constructor(
    adapter: PageNavigationSource,
    readonly browserSelection: Pick<BlockBrowserSelectionApi, "focusBlock">,
    private readonly virtualization: Pick<BlockEditorController["virtualization"], "get">,
  ) {
    super(adapter.blocks, adapter.selection);
  }

  /**
   * Finds navigation operations for a displayed Page's opaque surface identity.
   *
   * @param identity - Opaque identity of the displayed Page surface.
   * @returns Borrowed navigation operations, or undefined when not registered.
   */
  static getForIdentity(
    identity: object,
  ):
    | Pick<PageNavigationApi, "captureAttachment" | "mountFirstOrLastBlock" | "browserSelection">
    | undefined {
    return this.controllers.get(identity);
  }

  /**
   * Checks whether this controller still owns its mounted Page occurrence.
   *
   * A later controller can replace its registration on the same surface. If a
   * Root was supplied, it must also remain attached to its owning panel.
   *
   * @returns False while unmounted, replaced, or after the borrowed Root detaches.
   * @throws Propagates the borrowed Root's attachment check.
   */
  isAttached(): boolean {
    const occurrence = this.occurrence;
    const identity = occurrence?.getElementIdentity();
    if (!occurrence || !identity || PageNavigationController.controllers.get(identity) !== this) {
      return false;
    }
    const attached = occurrence.isAttached();
    return (
      attached &&
      this.occurrence === occurrence &&
      this.registryIdentity() === identity &&
      PageNavigationController.controllers.get(identity) === this
    );
  }

  /**
   * Captures a check for this exact navigation attachment.
   *
   * A replacement on the same surface does not reactivate the captured check.
   *
   * @returns A check that reports whether this attachment remains current.
   * @throws Propagates attachment-check failures when the returned check runs.
   */
  captureAttachment(): () => boolean {
    const attachment = this.attachment;
    return () => this.attachment === attachment && this.isAttached();
  }

  /**
   * Replaces the occurrence root and releases any old scroll anchoring suspension.
   *
   * Old suspension disposers cannot affect a new attachment, even to the same element.
   * Unmarked roots are ignored; canvas roots delegate mounting to their card projection.
   *
   * @param occurrence - Borrowed Root for the panel, or null during detach and destruction.
   * @returns The bridge belongs only to the current Page root.
   * @throws Propagates browser attribute or style failures.
   */
  setRoot(occurrence: PageNavigationRoot | null): void {
    const previous = this.occurrence;
    const previousAttachment = this.attachment;
    if (previous) {
      const identity = previous.getElementIdentity();
      if (this.occurrence !== previous || this.attachment !== previousAttachment) {
        return;
      }
      if (identity && PageNavigationController.controllers.get(identity) === this) {
        PageNavigationController.controllers.delete(identity);
      }
    }
    this.occurrence = undefined;
    this.suspensions = 0;
    this.attachment = {};
    const attachment = this.attachment;
    const release = this.releaseScrollAnchor;
    this.releaseScrollAnchor = undefined;
    release?.();
    if (this.attachment !== attachment) {
      return;
    }
    const marker = occurrence?.readAttribute("data-rivto-block-editor");
    if (this.attachment !== attachment) {
      return;
    }
    this.occurrence = marker !== undefined ? (occurrence ?? undefined) : undefined;
    if (this.occurrence) {
      const identity = this.occurrence.getElementIdentity();
      if (this.attachment === attachment && this.occurrence === occurrence) {
        PageNavigationController.controllers.set(identity, this);
      }
    }
  }

  /**
   * Registers the current canvas surface's card-mounting capability.
   *
   * A replacement belongs to its own surface lifetime; a stale disposer cannot
   * remove a newer registration. The canvas source remains owned by its surface.
   *
   * @param source - Borrowed card-mounting capability for this panel occurrence.
   * @returns Idempotent disposer releasing only this registration.
   */
  attachCanvas(source: PageCanvasMount): () => void {
    const attachment = { source };
    this.canvasAttachment = attachment;
    return () => {
      if (this.canvasAttachment === attachment) {
        this.canvasAttachment = undefined;
      }
    };
  }

  /**
   * Mounts requested expanded endpoints through Page before a caller reads their DOM.
   *
   * @param blockIds - Canonical model IDs; missing and collapsed targets remain absent.
   * @param options - Disable scrolling for selection restoration that preserves its own anchor.
   * @returns Targets are mounted synchronously; the last offscreen target is revealed if requested.
   * @throws Propagates model reads and React commit failures.
   */
  override mountBlocks(blockIds: readonly string[], options?: PageMountOptions): void {
    const root = this.occurrence;
    if (!root) {
      return;
    }
    const view = this.virtualization.get(root);
    if (view) {
      view.mountBlocks(blockIds);
    } else {
      this.canvasAttachment?.source.mountBlocks(blockIds, root);
    }
    const id = blockIds.at(-1);
    if (options?.scroll !== false && id) {
      root.scrollFirstMatchingRegionIntoView(BLOCK_ID_ATTRIBUTE, id, PANEL_SELECTOR);
    }
  }

  /**
   * Shares one saved overflow-anchor value among overlapping structural commands.
   *
   * @returns Idempotent cleanup restoring anchoring when the last current suspension ends.
   */
  suspendScrollAdjustments(): () => void {
    const root = this.occurrence;
    const attachment = this.attachment;
    if (root && this.suspensions === 0) {
      const release = root.suspendScrollAnchoring();
      if (this.attachment !== attachment || this.occurrence !== root) {
        release();
        return () => {};
      }
      this.releaseScrollAnchor = release;
    }
    if (root) {
      this.suspensions += 1;
    }
    let active = true;
    return () => {
      if (!active || !root || attachment !== this.attachment) {
        return;
      }
      active = false;
      if (--this.suspensions === 0) {
        const release = this.releaseScrollAnchor;
        this.releaseScrollAnchor = undefined;
        release?.();
      }
    };
  }

  /**
   * Resolves the current registration key without retaining a second Root reference.
   *
   * The identity belongs to the surface, while the attachment token separately
   * distinguishes later Root occurrences mounted on the same element.
   *
   * @returns Opaque surface identity, or undefined when unmounted.
   */
  private registryIdentity(): object | undefined {
    return this.occurrence?.getElementIdentity();
  }
}
