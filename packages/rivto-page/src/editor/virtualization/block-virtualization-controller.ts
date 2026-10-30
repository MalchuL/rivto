import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import { flushSync } from "react-dom";
import type { BlockEditorBlocks, BlockEditorSelection, BlockListType } from "../../adapter/types";

/** Public windowing settings for a vertical display list of complete subtrees. */
export interface BlockVirtualizationOptions {
  /** Whether to window the display list; defaults to true when settings are supplied. */
  readonly enabled?: boolean;
  /** Initial height of an unmeasured subtree in CSS pixels; defaults to 240. */
  readonly estimateSize?: number;
  /** Extra roots mounted on each side of the viewport; defaults to 3. */
  readonly overscan?: number;
}

/** Borrowed operations for resolving an offscreen model position before reading DOM. */
export interface BlockVirtualizationApi {
  /**
   * Synchronously mounts the display roots containing the requested IDs.
   *
   * Pins accumulate until the next native selection change; focus and endpoints remain pinned
   * independently. Collapsed descendants stay collapsed. Call from events, not render.
   *
   * @param blockIds - Model IDs, including descendants of displayed roots.
   * @returns Requested expanded DOM is mounted; unknown IDs are ignored.
   * @throws Propagates host hierarchy reads and synchronous React commit failures.
   */
  mountBlocks(blockIds: readonly string[]): void;
}

/** View-owned range policy; the adapter retains data and selection while DOM is absent. */
export class BlockVirtualizationController implements BlockVirtualizationApi {
  private static readonly views = new WeakMap<HTMLElement, BlockVirtualizationApi>();
  private root: HTMLElement | undefined;
  private followingEnd = false;
  private endFrame: number | undefined;
  private readonly rootIndices = new Map<string, number>();
  private readonly listTypes = new Map<string, BlockListType | undefined>();
  private readonly numbers = new Map<string, number>();
  private readonly subscriptions = new Map<string, () => void>();
  private ids: readonly string[] = [];
  private requested: readonly string[] = [];
  private nativeIds: readonly string[] = [];

  /**
   * Borrows hierarchy reads and owns only view-local metadata subscriptions.
   *
   * @param blocks - Source resolving descendant identities and observing root list decoration.
   * @param selection - Borrowed canonical endpoint reads; the controller neither writes selection nor subscribes to its lifetime.
   * @param invalidate - Requests a React range update when pins or list numbers change.
   */
  constructor(
    private readonly blocks: Pick<
      BlockEditorBlocks,
      "getBlockNode" | "subscribeBlockNode" | "getParentId"
    >,
    private readonly selection: Pick<BlockEditorSelection, "get">,
    private readonly invalidate: () => void,
  ) {}

  /**
   * Finds the mounted windowing view of an editor root.
   *
   * @param root - Exact editor root; nested editors never borrow an ancestor's view.
   * @returns Borrowed mount capability, or undefined when windowing is disabled.
   */
  static getForRoot(root: HTMLElement): BlockVirtualizationApi | undefined {
    return this.views.get(root);
  }

  /**
   * Supplies the current complete display order before range extraction.
   *
   * @param ids - Complete display order, never a viewport-filtered array.
   * @returns Root lookup and list counters reflect the new display order.
   * @throws Propagates host snapshot read failures.
   */
  setBlockIds(ids: readonly string[]): void {
    if (this.ids !== ids) {
      this.ids = ids;
      this.rootIndices.clear();
      ids.forEach((id, index) => this.rootIndices.set(id, index));
      for (const id of ids) {
        this.listTypes.set(id, this.blocks.getBlockNode(id)?.listType);
      }
      this.recalculateNumbers();
    }
  }

  /**
   * Observes native endpoints and focus for this mounted occurrence only.
   *
   * @param host - Flow container inside the editor root.
   * @param onMargin - Receives the container's document offset in CSS pixels.
   * @returns Idempotent cleanup releasing listeners and the bridge without clearing model selection.
   * @throws If already attached, outside an editor, or a host subscription fails.
   */
  attach(host: HTMLElement, onMargin: (offset: number) => void): () => void {
    if (this.root) {
      throw new Error("Virtualization is already attached");
    }
    const root = host.closest<HTMLElement>("[data-rivto-block-editor]");
    if (!root) {
      throw new Error("Virtualization requires a BlockEditor root");
    }
    this.root = root;
    let releaseGeometry = () => {};
    let active = true;
    /**
     * Releases this attachment once, including during setup rollback.
     *
     * @returns All owned resources have been offered cleanup.
     * @throws AggregateError if one or more disposers failed.
     */
    const detach = () => {
      if (active) {
        active = false;
        this.detach(root, releaseGeometry);
      }
    };
    try {
      releaseGeometry = this.observeGeometry(host, root, onMargin);
      BlockVirtualizationController.views.set(root, this);
      root.addEventListener("focusin", this.captureNativeIds);
      root.addEventListener("focusout", this.captureNativeIds);
      root.ownerDocument.addEventListener("selectionchange", this.captureNativeIds);
      this.captureNativeIds();
      this.reconcileListSubscriptions();
      return detach;
    } catch (error) {
      try {
        detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Virtualization attachment failed");
      }
      throw error;
    }
  }

  /**
   * Adds endpoint roots to the visible range without mounting intermediate selected blocks.
   *
   * Canonical endpoints survive transient browser selection collapse during focus
   * restoration, including Firefox dropping a native anchor at a virtual boundary.
   * Range calculations read the current host snapshot without copying its coverage.
   *
   * @param range - Visible range and overscan computed from measured root heights.
   * @returns Sorted unique indices in canonical display order.
   */
  getRangeIndices = (range: Range): number[] => {
    const indices = new Set(defaultRangeExtractor(range));
    const selection = this.selection.get();
    const endpoints = [selection?.anchorBlockId, selection?.focusBlockId];
    for (const id of [...this.requested, ...this.nativeIds, ...endpoints]) {
      if (!id) {
        continue;
      }
      const index = this.findRootIndex(id);
      if (index >= 0) {
        indices.add(index);
      }
    }
    return [...indices].sort((left, right) => left - right);
  };

  /**
   * Mounts model endpoints before a caller resolves their text nodes.
   *
   * @param blockIds - Requested block identities; missing IDs produce no DOM.
   * @returns React has committed the requested expanded subtrees without scrolling.
   * @throws Propagates host hierarchy reads and synchronous React commit failures.
   */
  mountBlocks(blockIds: readonly string[]): void {
    if (!this.root) {
      return;
    }
    this.requested = [...new Set([...this.requested, ...blockIds])];
    flushSync(this.invalidate);
  }

  /**
   * Reconciles lightweight counter subscriptions after display order changes.
   *
   * Only list-mode changes invalidate the virtual tree; text and selection updates
   * retain its render boundary. Metadata subscriptions do not mount block renderers.
   *
   * @returns Removed roots are released and current roots are observed once.
   */
  reconcileListSubscriptions(): void {
    for (const [id, unsubscribe] of this.subscriptions) {
      if (!this.rootIndices.has(id)) {
        unsubscribe();
        this.subscriptions.delete(id);
        this.listTypes.delete(id);
      }
    }
    for (const id of this.ids) {
      if (!this.subscriptions.has(id)) {
        /**
         * Reconciles this root's list decoration after subscription or an addressed change.
         *
         * @returns Only changed list decoration invalidates the windowed projection.
         */
        const readListType = () => {
          const type = this.blocks.getBlockNode(id)?.listType;
          if (this.listTypes.get(id) !== type) {
            this.listTypes.set(id, type);
            this.recalculateNumbers();
            this.invalidate();
          }
        };
        this.subscriptions.set(id, this.blocks.subscribeBlockNode(id, readListType));
        readListType();
      }
    }
  }

  /**
   * Reads the canonical counter value including unmounted preceding roots.
   *
   * @param id - Displayed root identity.
   * @returns Counter value, zero before the first numbered member.
   */
  getListNumber(id: string): number {
    return this.numbers.get(id) ?? 0;
  }

  /**
   * Observes document-space geometry without measuring every block during scrolling.
   *
   * @param host - Flow container whose top defines the virtualizer's scroll margin.
   * @param root - Owning editor occurrence.
   * @param onMargin - Receives the current document offset in CSS pixels.
   * @returns Cleanup disconnecting resize and end-following scroll listeners.
   */
  private observeGeometry(
    host: HTMLElement,
    root: HTMLElement,
    onMargin: (offset: number) => void,
  ): () => void {
    const view = root.ownerDocument.defaultView!;
    /**
     * Reconciles the document offset after viewport or surrounding chrome changes.
     *
     * @returns The virtualizer receives its current window scroll margin.
     */
    const measure = () => {
      onMargin(host.getBoundingClientRect().top + view.scrollY);
      this.scheduleEndAdjustment();
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(root);
    observer?.observe(root.ownerDocument.body);
    view.addEventListener("resize", measure);
    view.addEventListener("scroll", this.captureScroll, true);
    return () => {
      observer?.disconnect();
      view.removeEventListener("resize", measure);
      view.removeEventListener("scroll", this.captureScroll, true);
      if (this.endFrame !== undefined) {
        view.cancelAnimationFrame(this.endFrame);
      }
      this.endFrame = undefined;
      this.followingEnd = false;
    };
  }

  /**
   * Releases view resources even if a host subscription disposer fails.
   *
   * @param root - Occurrence captured by the attachment being removed.
   * @param releaseGeometry - Disconnects measurement and scheduled scroll work.
   * @returns Bridge, DOM references and all metadata subscriptions are released.
   * @throws AggregateError containing any failed cleanup operations.
   */
  private detach(root: HTMLElement, releaseGeometry: () => void): void {
    root.removeEventListener("focusin", this.captureNativeIds);
    root.removeEventListener("focusout", this.captureNativeIds);
    root.ownerDocument.removeEventListener("selectionchange", this.captureNativeIds);
    BlockVirtualizationController.views.delete(root);
    const cleanups = [releaseGeometry, ...this.subscriptions.values()];
    this.subscriptions.clear();
    this.root = undefined;
    this.requested = [];
    this.nativeIds = [];
    const errors: unknown[] = [];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Virtualization cleanup failed");
    }
  }

  /**
   * Records whether the user reached the page end before React measures new roots.
   *
   * Capture phase runs before the virtualizer's scroll listener can replace DOM.
   *
   * @returns Scrolling away cancels end following; ordinary middle scrolling is unchanged.
   */
  private captureScroll = (): void => {
    const document = this.root?.ownerDocument;
    const view = document?.defaultView;
    if (view && document) {
      this.followingEnd =
        view.scrollY + view.innerHeight >= document.documentElement.scrollHeight - 2;
    }
  };

  /**
   * Keeps an end-of-document scroll at the end as estimated heights become measured.
   *
   * @returns At most one frame is scheduled; detach cancels it and middle scrolling opts out.
   */
  private scheduleEndAdjustment(): void {
    const root = this.root;
    const view = root?.ownerDocument.defaultView;
    if (!root || !view || !this.followingEnd || this.endFrame !== undefined) {
      return;
    }
    this.endFrame = view.requestAnimationFrame(() => {
      this.endFrame = undefined;
      if (this.followingEnd && this.root === root) {
        view.scrollTo({
          top: root.ownerDocument.documentElement.scrollHeight,
          behavior: "instant",
        });
      }
    });
  }

  /**
   * Recomputes root counters only after order or list decoration changes.
   *
   * @returns Numbered runs restart after ordinary blocks; continue mode retains the last number.
   */
  private recalculateNumbers(): void {
    let value = 0;
    let previousNumbered = false;
    this.numbers.clear();
    for (const id of this.ids) {
      const type = this.listTypes.get(id);
      const numbered =
        type === "numbered_list" ||
        type === "start_numbered_list" ||
        type === "continue_numbered_list";
      if (type === "start_numbered_list" || (type === "numbered_list" && !previousNumbered)) {
        value = 1;
      } else if (numbered) {
        value += 1;
      }
      this.numbers.set(id, value);
      previousNumbered = numbered;
    }
  }

  /**
   * Maps an ID to its displayed ancestor without depending on mounted elements.
   *
   * The ancestor walk runs for pinned endpoints, not for each rendered block. A host
   * display list may contain unrelated roots; no shared model parent is inferred.
   *
   * @param id - Requested model identity.
   * @returns Display index, or -1 when no displayed subtree contains the ID.
   */
  private findRootIndex(id: string): number {
    let current: string | undefined = id;
    while (current) {
      const index = this.rootIndices.get(current);
      if (index !== undefined) {
        return index;
      }
      current = this.blocks.getParentId(current);
      if (current && this.blocks.getBlockNode(current)?.collapsed) {
        return -1;
      }
    }
    return -1;
  }

  /**
   * Captures only this occurrence's focused block and registered native text endpoints.
   *
   * Browser ranges on structural labels can remain after whole-block selection
   * changes. Live carets and text ranges remain protected through their registered
   * content and focused element, without retaining previously clicked offscreen cards.
   *
   * @returns A changed pin set schedules a range update; unchanged endpoints do no work.
   */
  private captureNativeIds = (): void => {
    const root = this.root;
    if (!root) {
      return;
    }
    const selection = root.ownerDocument.getSelection();
    const ids = new Set<string>();
    const active = root.ownerDocument.activeElement;
    for (const node of [active, selection?.anchorNode, selection?.focusNode]) {
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      if (element?.closest("[data-rivto-block-editor]") !== root) {
        continue;
      }
      if (node !== active && !root.contains(element.closest("[data-block-content]"))) {
        continue;
      }
      const id = element.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      if (id) {
        ids.add(id);
      }
    }
    const next = [...ids];
    if (
      this.requested.length > 0 ||
      next.length !== this.nativeIds.length ||
      next.some((id, index) => id !== this.nativeIds[index])
    ) {
      this.nativeIds = next;
      this.requested = [];
      this.invalidate();
    }
  };
}
