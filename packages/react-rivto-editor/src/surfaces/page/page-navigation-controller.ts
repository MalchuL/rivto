import { EdgelessCanvasAdapter } from "../edgeless/canvas-adapter";
import {
  BlockNavigation,
  BlockVirtualizationController,
  type BlockEditorAdapter,
} from "@chulane/rivto-page";
import { PANEL_SELECTOR, PanelDOM } from "../../panels/panel-dom";

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
  /** Borrowed model order and text metadata for Page DOM conversion. */
  readonly selection: PageNavigationSource["selection"];
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
  private static readonly controllers = new WeakMap<HTMLElement, PageNavigationController>();
  private root: HTMLElement | null = null;
  private suspensions = 0;
  private previousOverflowAnchor = "";
  /** Identity distinguishes remounts even when React reuses the same DOM root. */
  private attachment = {};

  /**
   * Borrows addressed hierarchy and the panel's canonical selection projection.
   *
   * @param adapter - Existing Page adapter; neither model nor selection is copied or destroyed.
   */
  constructor(adapter: PageNavigationSource) {
    super(adapter.blocks, adapter.selection);
  }

  /**
   * Finds navigation operations within the exact displayed Page occurrence.
   *
   * @param element - Surface or descendant seeking its owning Page view.
   * @returns Borrowed navigation operations, or undefined outside an attached Page.
   */
  static getForElement(element: HTMLElement): PageNavigationApi | undefined {
    const root = element.closest<HTMLElement>("[data-rivto-block-editor]");
    if (!root || element.closest(PANEL_SELECTOR) !== root.closest(PANEL_SELECTOR)) {
      return undefined;
    }
    return this.controllers.get(root);
  }

  /**
   * Replaces the occurrence root and releases any old scroll anchoring suspension.
   *
   * Old suspension disposers cannot affect a new attachment, even to the same element.
   * Unmarked roots are ignored; canvas roots delegate mounting to their card projection.
   *
   * @param root - Panel root, or null during detach and destruction.
   * @returns The bridge belongs only to the current Page root.
   */
  setRoot(root: HTMLElement | null): void {
    if (this.root) {
      if (PageNavigationController.controllers.get(this.root) === this) {
        PageNavigationController.controllers.delete(this.root);
      }
      if (this.suspensions) {
        this.root.style.overflowAnchor = this.previousOverflowAnchor;
      }
    }
    this.suspensions = 0;
    this.attachment = {};
    this.root = root?.hasAttribute("data-rivto-block-editor") ? root : null;
    if (this.root) {
      PageNavigationController.controllers.set(this.root, this);
    }
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
    const root = this.root;
    if (!root) {
      return;
    }
    const view = BlockVirtualizationController.getForRoot(root);
    if (view) {
      view.mountBlocks(blockIds);
    } else {
      EdgelessCanvasAdapter.mountBlocksForElement(root, blockIds);
    }
    const id = blockIds.at(-1);
    if (options?.scroll !== false && id) {
      new PanelDOM(root).findBlock(id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  /**
   * Shares one saved overflow-anchor value among overlapping structural commands.
   *
   * @returns Idempotent cleanup restoring anchoring when the last current suspension ends.
   */
  suspendScrollAdjustments(): () => void {
    const root = this.root;
    const attachment = this.attachment;
    if (root && this.suspensions++ === 0) {
      this.previousOverflowAnchor = root.style.overflowAnchor;
      root.style.overflowAnchor = "none";
    }
    let active = true;
    return () => {
      if (!active || !root || attachment !== this.attachment) {
        return;
      }
      active = false;
      if (--this.suspensions === 0) {
        root.style.overflowAnchor = this.previousOverflowAnchor;
      }
    };
  }
}
