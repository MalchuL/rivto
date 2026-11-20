import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import { flushSync } from "react-dom";
import type { BlockEditorBlocks, BlockEditorSelection, BlockListType } from "../../adapter/types";

import type { InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { BlockVirtualizationGeometryObserver, BlockVirtualizationView } from "./types";
import type { BlockVirtualizationRegistry } from "./block-virtualization-registry";

/** View-owned range policy; the adapter retains data and selection while DOM is absent. */
export class BlockVirtualizationController implements BlockVirtualizationView {
  private attached = false;
  private readonly rootIndices = new Map<string, number>();
  private readonly listTypes = new Map<string, BlockListType | undefined>();
  private readonly numbers = new Map<string, number>();
  private readonly subscriptions = new Map<string, () => void>();
  private ids: readonly string[] = [];
  private requested: readonly string[] = [];
  private nativeIds: readonly string[] = [];
  private observeGeometry: BlockVirtualizationGeometryObserver | undefined;

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
   * Registers this mounted windowing view and its Root-dependent observations.
   *
   * Focus and native text endpoints are observed through Root as soon as the
   * matching editor attachment is bound, regardless of which attaches first.
   * Geometry starts and stops with the same matching attachment.
   *
   * @param identity - Opaque identity of the mounted editor surface.
   * @param observeGeometry - Starts measurement through the matching Root and returns its cleanup.
   * @param registry - Editor-owned registration capability for this mounted view.
   * @returns Idempotent cleanup releasing observation and geometry without clearing model selection.
   * @throws If already attached, the registry is destroyed, or geometry,
   * Root observation, or a host subscription fails.
   */
  attach(
    identity: RegionIdentity,
    observeGeometry: BlockVirtualizationGeometryObserver,
    registry: Pick<BlockVirtualizationRegistry, "register">,
  ): () => void {
    if (this.attached) {
      throw new Error("Virtualization is already attached");
    }
    this.attached = true;
    this.observeGeometry = observeGeometry;
    let releaseView = () => {};
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
        this.detach(releaseView);
      }
    };
    try {
      releaseView = registry.register(identity, this);
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
   * Observes geometry and focused and selected owners through the matching Root attachment.
   *
   * The Root immediately reports current state and continues until the editor or
   * this mounted view releases the observation.
   *
   * @param root - Borrowed occurrence capability owned by the editor attachment.
   * @returns Disposer releasing this view's Root observations.
   * @throws Propagates browser observation setup, initial notification, and rollback failures.
   */
  observeRoot(root: Pick<InputRoot, "observeTextOwners" | "captureRegionByIdentity">): () => void {
    const releaseGeometry = this.observeGeometry?.(root) ?? (() => {});
    let releaseOwners: () => void;
    try {
      releaseOwners = root.observeTextOwners(
        {
          ownerSelector: "[data-block-id]",
          ownerAttribute: "data-block-id",
          contentSelector: "[data-block-content]",
          boundarySelector: "[data-rivto-block-editor]",
        },
        (ids) => this.updateObservedIds(ids),
      );
    } catch (error) {
      try {
        releaseGeometry();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Virtualization observation setup failed");
      }
      throw error;
    }
    return () => releaseVirtualizationObservations(releaseOwners, releaseGeometry);
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
    if (!this.attached) {
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
   * Releases view resources even if a host subscription disposer fails.
   *
   * @param releaseView - Releases this exact editor-owned view registration.
   * @returns Bridge, DOM references and all metadata subscriptions are released.
   * @throws AggregateError containing any failed cleanup operations.
   */
  private detach(releaseView: () => void): void {
    const cleanups = [releaseView, ...this.subscriptions.values()];
    this.subscriptions.clear();
    this.attached = false;
    this.observeGeometry = undefined;
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
   * Reconciles the occurrence's focused block and registered native text endpoints.
   *
   * Browser ranges on structural labels can remain after whole-block selection
   * changes. Live carets and text ranges remain protected through their registered
   * content and focused element, without retaining previously clicked offscreen cards.
   *
   * @param ids - Unique focused and selected owner identities supplied by Root.
   * @returns A changed pin set schedules a range update; unchanged endpoints do no work.
   */
  private updateObservedIds(ids: readonly string[]): void {
    if (!this.attached) {
      return;
    }
    if (
      this.requested.length > 0 ||
      ids.length !== this.nativeIds.length ||
      ids.some((id, index) => id !== this.nativeIds[index])
    ) {
      this.nativeIds = [...ids];
      this.requested = [];
      this.invalidate();
    }
  }
}

/**
 * Releases both Root observations even when one disposer fails.
 *
 * @param releaseOwners - Releases focus and selection observation.
 * @param releaseGeometry - Releases geometry and scheduled scroll work.
 * @returns Both observations have been offered cleanup.
 * @throws AggregateError if either observation fails to release.
 */
function releaseVirtualizationObservations(
  releaseOwners: () => void,
  releaseGeometry: () => void,
): void {
  const errors: unknown[] = [];
  for (const release of [releaseOwners, releaseGeometry]) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Virtualization observation cleanup failed");
  }
}
