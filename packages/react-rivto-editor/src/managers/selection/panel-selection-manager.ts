import type {
  EditableBlockDirection,
  PanelSelectionHost,
  PendingSelectionCallback,
  StructuralPredecessorAction,
  ViewportSelectionAction,
  ViewportRoot,
} from "./types";
import type { InputRoot, TextSelectionQuery } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../panels/types";
import { SelectionViewport } from "./selection-viewport";
/**
 * Bridges core selection state to browser DOM selection.
 *
 * Core owns block selection with per-block offsets. React reads native
 * endpoints and restores them after rendering. Scheduled callbacks observe
 * effective core selection changes so newer selection changes always win,
 * including transitions from an empty selection back to an empty selection.
 */
import {
  isStructuralSelection,
  type EditorPosition,
  type Selection,
  type SelectionManagerApi,
} from "@chulane/rivto";
import { BlockSelectionRanges } from "@chulane/rivto-page";
import { PageNavigationController } from "../../surfaces/page/page-navigation-controller";
import { EDGELESS_ROOT_SELECTOR } from "../../surfaces/edgeless/markers";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import type { ContentInput } from "../events/types";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  PAGE_EDITOR_ROOT_SELECTOR,
} from "../../constants";
import type { RestoreDOMSelectionOptions, PanelSelectionApi } from "./api";

export { createCaretSelection, createTextSelection } from "@chulane/rivto";

/** Selectors shared by occurrence-bound block content and selection operations. */
const BLOCK_TEXT_SELECTION_QUERY: TextSelectionQuery = {
  ownerSelector: BLOCK_ID_SELECTOR,
  ownerAttribute: BLOCK_ID_ATTRIBUTE,
  contentSelector: BLOCK_CONTENT_SELECTOR,
  boundarySelector: PANEL_SELECTOR,
};

/** DOM adapter over the core selection manager. */
export class PanelSelectionManager implements PanelSelectionApi {
  private checkedSelection: Selection | undefined;
  private checkedRevision = -1;
  private contained = false;

  /** One pending frame per DOM root, cancelled by any effective core selection change. */
  private readonly pendingSelectionCallbacks = new Map<object, PendingSelectionCallback>();
  /**
   * Creates a DOM bridge scoped to one rendered occurrence.
   * Each panel owns its DOM adapter while sharing the document core selection.
   * DOM requests capture the receiving panel's event scope and remain separate
   * by root. Removing a surface cancels its own pending work; panel teardown
   * cancels its remaining requests before shared extensions are destroyed.
   * @param reactPanel - Owning panel editor providing its fixed DOM occurrence.
   * @param coreSelection - Core manager providing the document's local selection state.
   */
  constructor(
    private readonly reactPanel: PanelSelectionHost,
    private readonly coreSelection: Omit<SelectionManagerApi, "resolveBlockSelection">,
  ) {}

  /**
   * Runs a structural edit while retaining the current selection's viewport anchor.
   *
   * Deferred restoration belongs to the exact initiating registration, including
   * when the browser element is later attached to another occurrence.
   *
   * @param blockIds - Selected block identities in document order.
   * @param selection - Portable selection captured before the edit.
   * @param inputRoot - Exact input registration that initiated the command.
   * @param inputRegistration - Routing lifetime captured by the initiating input.
   * @param action - Synchronous host structural operation.
   * @returns Whether the action claimed the command, or false when the occurrence is inactive.
   * @throws Propagates browser, selection, mounting, and action failures.
   */
  runWithViewportPreserved(
    blockIds: readonly string[],
    selection: Selection,
    inputRoot: ViewportRoot & Pick<InputRoot, "isAttached">,
    inputRegistration: PanelInputRegistration,
    action: ViewportSelectionAction,
  ): boolean {
    /**
     * Checks that the captured input registration remains the current occurrence.
     *
     * @returns True only while this exact panel occurrence remains current.
     */
    const isCurrent = () =>
      this.reactPanel.inputRoot === inputRoot &&
      inputRegistration.isCurrent(inputRoot) &&
      inputRoot.isAttached() &&
      inputRegistration.isCurrent(inputRoot) &&
      this.reactPanel.inputRoot === inputRoot;
    if (!isCurrent()) {
      return false;
    }
    return SelectionViewport.run(
      inputRoot,
      this.reactPanel.pageNavigation,
      this,
      selection,
      blockIds,
      isCurrent,
      action,
    );
  }

  /**
   * Identifies a pending callback in the current panel whose scheduled model selection remains current.
   * @returns False after any effective core selection change, including explicit clearing.
   */
  get hasPendingSelectionCallback(): boolean {
    const root = this.reactPanel.enabled ? this.reactPanel.mountedRoot : undefined;
    if (!root) {
      return false;
    }
    const pending = this.pendingSelectionCallbacks.get(root.getElementIdentity?.() ?? root);
    return (
      pending?.occurrence === root &&
      root.isAttached() &&
      this.reactPanel.enabled &&
      this.reactPanel.mountedRoot === root
    );
  }

  /**
   * Resolves a rendered block's own content without crossing a nested block.
   *
   * Offscreen or contentless blocks are not mounted by this read.
   *
   * @param blockId - Persisted block identity within this occurrence.
   * @returns Content capability, or undefined when the panel or content is unavailable.
   * @throws Propagates browser lookup failures.
   */
  contentInput(blockId: string): ContentInput | undefined {
    return this.reactPanel.inputRoot?.findTextHost?.({
      ...BLOCK_TEXT_SELECTION_QUERY,
      ownerValue: blockId,
    });
  }

  /**
   * Runs an edit only when a rendered structural predecessor belongs to this scope.
   *
   * The navigation scope is captured before the edit because the current block
   * may be removed. Focus is skipped if the originating occurrence is replaced.
   * Virtualization and modal wrappers do not change the canonical preceding root
   * supplied by the caller. A predecessor absent from this surface remains
   * unavailable rather than crossing card boundaries. Editable content counts
   * only when it is directly owned by the predecessor, not by a child block.
   * Edgeless card scopes exclude siblings in other cards. Embedded sources retain
   * their own occurrence root even when displayed inside a host card, so lookup
   * cannot escape into the host document.
   *
   * @param blockId - Current block that determines the navigation scope.
   * @param predecessorId - Canonical preceding root to check in that scope.
   * @param action - Synchronous document edit performed before focus changes.
   * @param inputRoot - Originating keyboard attachment, omitted for direct UI calls.
   * @param inputRegistration - Keyboard routing lifetime, omitted for direct UI calls.
   * @returns True when the edit ran; false if the predecessor or occurrence is unavailable.
   * @throws Propagates browser lookup, action, selection, and focus failures.
   */
  runWithStructuralPredecessorFocus(
    blockId: string,
    predecessorId: string,
    action: StructuralPredecessorAction,
    inputRoot?: Pick<InputRoot, "isAttached">,
    inputRegistration?: PanelInputRegistration,
  ): boolean {
    const panel = this.reactPanel;
    const root = panel.enabled ? panel.mountedRoot : undefined;
    if (!root) {
      return false;
    }
    /**
     * Checks the captured surface and originating input registration.
     *
     * @returns True while the same occurrence remains active.
     */
    const isCurrent = () => this.isSelectionOccurrenceCurrent(root, inputRoot, inputRegistration);
    if (!isCurrent()) {
      return false;
    }
    const scope = root.captureTextOwnerScope(
      BLOCK_TEXT_SELECTION_QUERY,
      blockId,
      EDGELESS_ROOT_SELECTOR,
    );
    if (!scope?.hasContentlessOwner(predecessorId) || !isCurrent()) {
      return false;
    }
    action();
    if (!isCurrent()) {
      return true;
    }
    root.clearSelection();
    if (isCurrent()) {
      scope.focus();
    }
    return true;
  }

  /**
   * Finds the adjacent editable rendered block within the current card or panel.
   *
   * A contentless neighbor stops traversal. Page may mount an adjacent block at
   * a rendered boundary; the lookup never returns browser elements.
   * Block shells are walked in depth-first DOM order; their own content, rather
   * than a descendant's content, determines whether the neighboring block is editable.
   * A contentless custom block stops Backspace from merging text across structural controls.
   *
   * @param blockId - Current block identity.
   * @param direction - Whether to find the previous or next block.
   * @returns Neighbor identity, or undefined when detached, unavailable, or blocked.
   * @throws Propagates browser lookup and synchronous mounting failures.
   */
  adjacentEditableBlockId(blockId: string, direction: EditableBlockDirection): string | undefined {
    const panel = this.reactPanel;
    const root = panel.enabled ? panel.mountedRoot : undefined;
    if (!root) {
      return;
    }
    /**
     * Checks that this panel still uses the captured enabled occurrence.
     *
     * @returns True only while the same Root remains attached and interactive.
     */
    const isCurrent = () => root.isAttached() && panel.enabled && panel.mountedRoot === root;
    return root.adjacentTextPosition(
      BLOCK_TEXT_SELECTION_QUERY,
      blockId,
      direction === "previous" ? "left" : "right",
      EDGELESS_ROOT_SELECTOR,
      (id, step) => {
        if (panel.pageNavigation.isAttached() && isCurrent()) {
          panel.pageNavigation.mountAdjacentBlocks(id, step);
        }
      },
      isCurrent,
    )?.ownerId;
  }

  /**
   * Checks the rendered block's parent without crossing into a containing panel.
   *
   * This lookup does not mount an offscreen block.
   *
   * @param blockId - Persisted identity of the block to inspect.
   * @returns True for a rendered nested block; false for roots, missing blocks, or detached panels.
   * @throws Propagates browser lookup failures.
   */
  isRenderedBlockNested(blockId: string): boolean {
    const panel = this.reactPanel;
    const root = panel.enabled ? panel.mountedRoot : undefined;
    if (!root) {
      return false;
    }
    const nested = root.hasRegionAncestor({
      regionSelector: BLOCK_ID_SELECTOR,
      identityAttribute: BLOCK_ID_ATTRIBUTE,
      identity: blockId,
      ancestorSelector: BLOCK_ID_SELECTOR,
      boundarySelector: PANEL_SELECTOR,
    });
    return nested && panel.enabled && panel.mountedRoot === root;
  }

  /** @returns Detached current selection, or undefined when empty, outside this subtree,
   * or owned by another panel. */
  get(): Selection | undefined {
    return this.isSelectionInActivePanel() ? this.coreSelection.get() : undefined;
  }

  /**
   * Publishes selection through core without activating or focusing this panel.
   * A selection containing blocks outside this panel's subtree clears shared selection.
   * @param selection - Document selection values to publish.
   * @returns No value.
   */
  set(selection: Selection): void {
    if (!this.containsSelection(selection)) {
      this.clear();
      return;
    }
    this.coreSelection.set(selection);
  }

  /** Clears the document's shared selection, even when another panel last set it. */
  clear(): void {
    this.coreSelection.clear();
  }

  /**
   * Subscribes to the document's shared selection changes, including other panels.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.coreSelection.subscribe(listener);
  }

  /** Deletes selected content through core only when this panel owns the selection.
   * Does nothing when the selection is empty, outside this subtree, or owned by another panel. */
  delete(): void {
    if (!this.isSelectionInActivePanel()) {
      return;
    }
    const selection = this.coreSelection.get();
    if (
      selection &&
      isStructuralSelection(selection) &&
      selection.blocks.some(({ id }) => !this.reactPanel.blocks.canRemove(id))
    ) {
      return;
    }
    this.coreSelection.delete();
  }

  /** @returns Immutable core selection snapshot with stable identity until selection changes,
   * or undefined when empty, outside this subtree, or owned by another panel. */
  snapshot(): Selection | undefined {
    return this.isSelectionInActivePanel() ? this.coreSelection.snapshot() : undefined;
  }

  /**
   * Reads whole-block coverage from the document's shared selection in every panel.
   *
   * This visual query does not require active-panel ownership or containment of
   * the complete selection. Commands and DOM restoration retain their own scope.
   *
   * @param id - Document-local block ID whose structural coverage is queried.
   * @returns Whether the shared structural selection covers the block, including
   * when another panel owns the selection. Text ranges and carets return false.
   */
  isBlockSelected(id: string): boolean {
    return this.coreSelection.isBlockSelected(id);
  }

  /** @returns Whether an element belongs to the current selection. */
  isElementSelected(id: string): boolean {
    return this.isSelectionInActivePanel() && this.coreSelection.isElementSelected(id);
  }

  /**
   * Reads `window.getSelection()` when both endpoints belong to this editor root.
   *
   * Anchor and focus are read independently instead of using Range start/end.
   * A Range normalizes endpoints into document order and would lose the
   * direction of a bottom-to-top selection. Reads only this panel's mounted
   * occurrence; callers cannot select another root.
   *
   * @returns Detached directed selection, or undefined outside this editor or while unmounted.
   */
  readDOM(): Selection | undefined {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return undefined;
    }
    const selection = this.reactPanel.page.browserSelection.readEditorDOMSelection();
    return selection
      ? { ...selection, blocks: selection.blocks.map((block) => ({ ...block })) }
      : undefined;
  }

  /**
   * Reads displayed block order from this panel's attached Page selection.
   *
   * @returns Selectable IDs, or undefined if the panel does not own an attached Page root.
   * @throws Propagates failures from the Page selection projection.
   */
  selectableBlockIds(): readonly string[] | undefined {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return undefined;
    }
    return this.reactPanel.pageNavigation.selection.getSelectableBlockIds();
  }

  /**
   * Mounts a missing block when needed and requests focus on its content host.
   *
   * The Page occurrence resolves block identity and distinguishes unmounted
   * shells from contentless ones. Focus preserves browser scrolling behavior;
   * model selection remains unchanged.
   *
   * @param blockId - Persisted block identity in this panel.
   * @param offset - Requested flat UTF-16 caret offset.
   * @returns Whether a content host was found and focus requested, including when no browser selection exists.
   * @throws Propagates synchronous mounting, browser focus, and range failures.
   */
  focusBlock(blockId: string, offset: number): boolean {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return false;
    }
    const position = { blockId, offset };
    let result = this.reactPanel.page.browserSelection.focusBlock(position);
    if (result === "unmounted") {
      this.reactPanel.pageNavigation.mountBlocks([blockId]);
      result = this.reactPanel.page.browserSelection.focusBlock(position);
    }
    return result === "focus-requested";
  }

  /**
   * Moves a boundary caret to the adjacent page editor in DOM order.
   *
   * The target occurrence mounts its first or last block before focus. Its Page
   * selection capability maps the flat UTF-16 offset to a native caret, clamps
   * past-end offsets, and preserves browser scrolling without changing model selection.
   * Empty content is focused even when the browser has no Selection object.
   * An unregistered Page cannot receive an occurrence-bound focus request.
   *
   * @param direction - Adjacent editor direction.
   * @returns Whether another editor found editable content and requested focus.
   * @throws Propagates target mounting, browser focus, or Range failures.
   */
  focusAdjacentEditor(direction: "up" | "down"): boolean {
    const panel = this.reactPanel;
    const root = panel.enabled ? panel.mountedRoot : undefined;
    // A subtree editor is contained by another page, not the next journal page.
    const adjacent = root?.findAdjacentOccurrence(
      PAGE_EDITOR_ROOT_SELECTOR,
      direction === "up" ? "previous" : "next",
    );
    if (!root || !adjacent) {
      return false;
    }
    /**
     * Checks the originating panel and the captured destination together.
     *
     * @returns True while the source remains enabled and both occurrences remain current.
     */
    const isCurrent = () =>
      panel.enabled &&
      panel.mountedRoot === root &&
      adjacent.isCurrent() &&
      panel.enabled &&
      panel.mountedRoot === root;
    const navigation = PageNavigationController.getForIdentity(adjacent.identity);
    if (!navigation) {
      return false;
    }
    const navigationCurrent = navigation.captureAttachment();
    if (!navigationCurrent() || !isCurrent()) {
      return false;
    }
    navigation.mountFirstOrLastBlock(direction === "up" ? -1 : 1);
    if (!navigationCurrent() || !isCurrent()) {
      return false;
    }
    const position = adjacent.readEdgeTextPosition(
      BLOCK_TEXT_SELECTION_QUERY,
      direction === "up" ? "last" : "first",
    );
    if (!position || !navigationCurrent() || !isCurrent()) {
      return false;
    }
    return (
      navigation.browserSelection.focusBlock({
        blockId: position.ownerId,
        offset: position.offset,
      }) === "focus-requested"
    );
  }

  /**
   * Mounts a selected block and focuses its Page occurrence without a text range.
   *
   * Model selection remains unchanged. The current panel must still own its
   * navigation attachment when the request begins.
   *
   * @param blockId - Identity of the selected block to reveal.
   * @returns Whether the attached occurrence received a focus request.
   * @throws Propagates mounting and browser focus or scrolling failures.
   */
  focusBlockSelection(blockId: string): boolean {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return false;
    }
    this.reactPanel.pageNavigation.mountBlocks([blockId]);
    return this.reactPanel.page.browserSelection.focusBlockSelection(blockId);
  }

  /**
   * Resolves horizontal movement without exposing rendered block elements.
   *
   * The Page browser selection keeps movement inside a card when present and
   * asks this panel's navigation owner to mount only at a surface edge.
   *
   * @param blockId - Current block identity.
   * @param direction - Previous or next rendered block.
   * @returns Neighboring caret position, or undefined when detached, blocked, or at an edge.
   * @throws Propagates browser lookup and synchronous mounting failures.
   */
  adjacentCaretPosition(blockId: string, direction: "left" | "right"): EditorPosition | undefined {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return;
    }
    return this.reactPanel.page.browserSelection.adjacentCaretPosition(
      blockId,
      direction,
      EDGELESS_ROOT_SELECTOR,
      (id, step) => this.reactPanel.pageNavigation.mountAdjacentBlocks(id, step),
    );
  }

  /**
   * Resolves a visual-line move inside this panel's currently attached occurrence.
   *
   * The Page browser selection performs the geometry; this panel resolves and
   * mounts adjacent editable blocks only when the move leaves the current block.
   *
   * @param position - Current block identity and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @returns Nearest position, or undefined when detached, unresolved, or at an edge.
   * @throws Propagates browser measurement and synchronous mounting failures.
   */
  verticalCaretPosition(
    position: EditorPosition,
    direction: "up" | "down",
  ): EditorPosition | undefined {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return;
    }
    return this.reactPanel.page.browserSelection.verticalCaretPosition(
      position,
      direction,
      (id, step) => this.reactPanel.pageNavigation.mountAdjacentBlocks(id, step),
    );
  }

  /**
   * Publishes a directed text range using this occurrence's displayed order.
   *
   * The model is updated before browser restoration. An unavailable browser
   * range does not undo a successfully published model selection.
   *
   * @param anchor - Fixed endpoint of the selection.
   * @param head - Moving endpoint of the selection.
   * @returns True when a model range was published; false if the occurrence or an endpoint is missing.
   * @throws Propagates selection, mounting, and browser restoration failures.
   */
  selectTextRange(anchor: EditorPosition, head: EditorPosition): boolean {
    if (!this.reactPanel.pageNavigation.isAttached()) {
      return false;
    }
    const range = BlockSelectionRanges.createFromPositions(
      this.reactPanel.pageNavigation.selection,
      anchor,
      head,
    );
    if (!range) {
      return false;
    }
    this.set({ ...range, blocks: range.blocks.map((block) => ({ ...block })) });
    this.restoreDOM();
    return true;
  }

  /**
   * Restores the browser range represented by an editor text selection.
   *
   * Structural commands can preserve block IDs and text offsets while React
   * reparents their DOM elements. The browser range still points at detached
   * nodes and is commonly cleared. After mounting virtual endpoints, Page
   * resolves them against the newly rendered content, focuses the moving
   * endpoint, and recreates the directed native selection inside that block.
   *
   * Whole-block selections have no native text range, so they return false
   * without changing focus. Missing rendered endpoints also return false;
   * callers can safely retry after a later render. Restoration targets only
   * this panel's current mounted occurrence.
   *
   * @param selection - Selection to restore, defaulting to current state.
   * @param options - Virtual endpoint mounting and navigation policy.
   * @returns Whether both text endpoints could be restored; false when unmounted.
   */
  restoreDOM(
    selection: Selection | undefined = this.get(),
    options?: RestoreDOMSelectionOptions,
  ): boolean {
    if (
      !this.reactPanel.pageNavigation.isAttached() ||
      !selection ||
      isStructuralSelection(selection)
    ) {
      return false;
    }
    this.reactPanel.pageNavigation.mountBlocks(
      [selection.anchorBlockId, selection.focusBlockId].filter((id): id is string => Boolean(id)),
      options,
    );
    return this.reactPanel.page.browserSelection.restoreEditorDOMSelection(selection);
  }

  /**
   * Schedules a callback for the next animation frame while its selection remains current.
   * A scoped core subscription ignores equivalent publications and cancels on
   * effective updates, even when selection changes away and back to empty.
   * New native input, pointer gestures, or keys cancel restoration immediately, before the browser's
   * deferred selectionchange can publish the newer caret to core. Moving focus
   * outside the surface also cancels restoration; a temporary blur without a
   * new focus target during DOM reconciliation keeps the request alive.
   * The subscription ends before invocation so the callback may publish its
   * result. A transient empty browser range is handled by the native selection
   * bridge while pending and does not invalidate the preserved model selection.
   *
   * Use this slot only for caret, DOM selection, and their associated editing focus.
   * Keep document mutations and independent UI work outside the callback: a new
   * scheduled callback replaces the previous one for that DOM root even if
   * selection is unchanged. Requests in other panels remain independently cancellable.
   * Endpoint mounting and viewport preservation may support selection restoration,
   * but must not turn this into a scheduler for unrelated operations.
   *
   * Panel-bound root access is retained until invocation or cancellation.
   *
   * @param callback - Work to run next frame if selection has not changed since scheduling.
   * @param onCancel - Cleanup for caller-owned resources when the callback cannot run.
   * @returns An idempotent cancellation function, also invoked during runtime teardown.
   * @throws Input subscription, frame scheduling, or cleanup failures; multiple failures are collected in an AggregateError.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void {
    const panel = this.reactPanel;
    const mountedRoot = panel.enabled ? panel.mountedRoot : undefined;
    const root = mountedRoot ? (mountedRoot.getElementIdentity?.() ?? mountedRoot) : undefined;
    const previous = root ? this.pendingSelectionCallbacks.get(root) : undefined;
    // Schedule and cancel through the mounted Root's own window, including iframes.
    // Without a mounted Root or frame clock there is no valid frame for this work.
    const clock = mountedRoot?.captureFrameClock();
    if (!root || !mountedRoot || !clock || !panel.enabled || panel.mountedRoot !== mountedRoot) {
      this.cancelSelectionCallback(previous);
      onCancel?.();
      return () => {};
    }
    // Capture the mounted occurrence, not whichever panel is active next frame.
    const pending: PendingSelectionCallback = {
      root,
      occurrence: mountedRoot,
      callback,
      onCancel,
      active: true,
    };
    /**
     * Cancels only this request, even after newer work replaces it.
     * @returns No value.
     */
    const cancel = (): void => this.cancelSelectionCallback(pending);
    this.pendingSelectionCallbacks.set(root, pending);
    let cancelFrame: (() => void) | undefined;
    try {
      if (!this.observeSelectionCancellation(pending, cancel)) {
        this.cancelSelectionCallback(pending);
        this.cancelSelectionCallback(previous);
        return cancel;
      }
      cancelFrame = clock.requestFrame(() => this.runSelectionCallback(pending));
    } catch (error) {
      const errors: unknown[] = [error];
      for (const request of [pending, previous]) {
        try {
          this.cancelSelectionCallback(request);
        } catch (cleanupError) {
          errors.push(cleanupError);
        }
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Selection scheduling and cleanup failed");
      }
      throw error;
    }
    if (!cancelFrame) {
      this.cancelSelectionCallback(pending);
    } else if (!pending.active) {
      cancelFrame();
    } else {
      pending.cancelFrame = cancelFrame;
    }
    // One callback owns this root's deferred selection work. Release the predecessor's
    // subscription and caller-owned resources after publishing the initialized request:
    // onCancel may schedule newer work, which must replace this request rather than leak.
    this.cancelSelectionCallback(previous);
    return cancel;
  }

  /**
   * Releases the pending callback before the owning runtime tears down extensions.
   * Cancelling removes the frame and core subscription and releases caller-owned
   * resources exactly once, including when destruction is repeated.
   * Requests for every mounted panel are cancelled here, including shared work
   * scheduled by their cancellation callbacks while cleanup is running.
   * Panels own separate DOM adapters, but never independent core selection state.
   * @returns No value.
   * @throws The cleanup error, or an AggregateError for multiple failures, after all requests are offered cleanup.
   */
  destroy(): void {
    const errors: unknown[] = [];
    for (const pending of this.pendingSelectionCallbacks.values()) {
      try {
        this.cancelSelectionCallback(pending);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length) {
      throw new AggregateError(errors, "Pending selection cleanup failed");
    }
  }

  /**
   * Checks the mounted occurrence and any originating input registration together.
   *
   * Owner checks can synchronously replace the panel's Root or input registration,
   * so both identities are checked again after the delegated attachment checks.
   *
   * @param root - Mounted occurrence captured before the selection operation.
   * @param inputRoot - Optional input registration captured by the originating command.
   * @param inputRegistration - Optional routing lifetime captured by the originating command.
   * @returns True only while both captured capabilities remain current.
   * @throws Propagates attachment-check failures.
   */
  private isSelectionOccurrenceCurrent(
    root: NonNullable<PanelSelectionHost["mountedRoot"]>,
    inputRoot?: Pick<InputRoot, "isAttached">,
    inputRegistration?: PanelInputRegistration,
  ): boolean {
    const panel = this.reactPanel;
    if (!root.isAttached() || !panel.enabled || panel.mountedRoot !== root) {
      return false;
    }
    const registrationCurrent =
      !inputRoot || (panel.inputRoot === inputRoot && inputRoot.isAttached());
    return (
      registrationCurrent &&
      root.isAttached() &&
      (!inputRegistration || (!!inputRoot && inputRegistration.isCurrent(inputRoot))) &&
      root.isAttached() &&
      (!inputRegistration || (!!inputRoot && inputRegistration.isCurrent(inputRoot))) &&
      panel.enabled &&
      panel.mountedRoot === root &&
      (!inputRoot || panel.inputRoot === inputRoot)
    );
  }

  /**
   * Observes selection and input changes that invalidate one deferred request.
   *
   * Every acquired subscription is retained on the request immediately so
   * cancellation and failed setup can release all previously acquired resources.
   *
   * @param pending - Request that owns the subscriptions.
   * @param cancel - Cancels this request when a newer interaction occurs.
   * @returns False if the Root detaches or the request is cancelled during setup.
   * @throws Propagates subscription and cleanup failures.
   */
  private observeSelectionCancellation(
    pending: PendingSelectionCallback,
    cancel: () => void,
  ): boolean {
    const releases: Array<() => void> = [];
    pending.unsubscribe = () => {
      const errors: unknown[] = [];
      for (const release of releases) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Selection subscription cleanup failed");
      }
    };
    // Observe changes as they happen rather than compare final snapshots: selection
    // may change and return to its original value before the frame, even to undefined.
    // Core ignores equivalent updates, so publishing the same selection keeps this valid.
    // subscribe does not invoke its listener immediately, and RAF is asynchronous;
    // the record's subscription and frame are initialized before either callback runs.
    releases.push(this.subscribe(cancel));
    for (const type of ["beforeinput", "pointerdown", "keydown"] as const) {
      const release = pending.occurrence.observeInput(type, cancel);
      if (!release) {
        return false;
      }
      releases.push(release);
      if (!pending.active) {
        release();
        return false;
      }
    }
    // An undo in one editor must not steal focus back after another is focused.
    const releaseFocus = pending.occurrence.observeInput("focusout", (input) => {
      if (input.hasRelatedTarget && !input.relatedTarget?.belongsToRoot()) {
        cancel();
      }
    });
    if (!releaseFocus) {
      return false;
    }
    releases.push(releaseFocus);
    if (!pending.active) {
      releaseFocus();
      return false;
    }
    return true;
  }

  /**
   * Checks that every selected element and block belongs to this panel.
   *
   * @param selection - Selection to inspect or copy; copy methods default to the panel's current selection when omitted.
   * @returns Whether the complete selection is contained in the panel.
   */
  private containsSelection(selection: Selection): boolean {
    if (selection.elements?.some((id) => !this.reactPanel.elements.hasElement(id))) {
      return false;
    }
    return selection.blocks.every(({ id }) => this.reactPanel.blocks.hasBlock(id));
  }

  /**
   * Checks whether this is the active or default panel and contains the complete shared selection.
   *
   * Ownership requires the last activated root, or the default root when no active
   * root is remembered, to match this panel's root. The shared selection must exist
   * and every selected block and element must belong to this panel's boundaries.
   * Subtree containment is cached by selection identity and block revision.
   *
   * This guards get(), snapshot(), delete(), and isElementSelected(); it does not
   * assign ownership or focus a panel. isBlockSelected() deliberately bypasses it so an original block
   * and its embeddings can all display the same structural selection.
   *
   * @returns Whether the root matches and the complete current selection is contained
   * in this panel. Returns false for an absent selection or a selection outside its boundaries.
   */
  private isSelectionInActivePanel(): boolean {
    // Prefer the user's last active occurrence; the default only fills an absent active root.
    const inputRoot = this.reactPanel.inputRoot;
    const activeRoot = this.reactPanel.editor.panels.getActiveInputRoot();
    if (!activeRoot && this.reactPanel.editor.panels.hasActivePanel()) {
      return false;
    }
    if (
      (activeRoot ?? this.reactPanel.editor.panels.getDefaultInputRoot()) !== inputRoot ||
      (!inputRoot && this.reactPanel.hasInteractiveRoot())
    ) {
      return false;
    }
    const value = this.coreSelection.snapshot();
    if (!value) {
      return false;
    }
    if (!this.reactPanel.rootBlockId) {
      return this.containsSelection(value);
    }
    const revision = this.reactPanel.document.getDocument().blocks.revision;
    // Rows reuse the immutable snapshot; check subtree membership once per revision.
    if (value !== this.checkedSelection || revision !== this.checkedRevision) {
      this.checkedSelection = value;
      this.checkedRevision = revision;
      this.contained = this.containsSelection(value);
    }
    return this.contained;
  }

  /**
   * Cancels a request's frame and releases caller resources exactly once.
   * @param pending - Request to cancel; missing or inactive requests are harmless.
   * @returns All resources and the caller's cancellation callback have been offered cleanup.
   * @throws The cleanup error, or an AggregateError when multiple cleanup operations fail.
   */
  private cancelSelectionCallback(pending: PendingSelectionCallback | undefined): void {
    if (!pending?.active) {
      return;
    }
    // Mark inactive before cleanup: onCancel may cancel again or schedule another
    // callback. Neither path may release this callback's resources a second time.
    pending.active = false;
    const errors: unknown[] = [];
    for (const release of [pending.cancelFrame, pending.unsubscribe]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    // Clear only our own entry; an old cancellation must never erase newer work.
    if (this.pendingSelectionCallbacks.get(pending.root) === pending) {
      this.pendingSelectionCallbacks.delete(pending.root);
    }
    try {
      pending.onCancel?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length) {
      throw new AggregateError(errors, "Selection callback cleanup failed");
    }
  }

  /**
   * Runs a still-active request only on the DOM surface where it was scheduled.
   * @param pending - Request whose animation frame has arrived.
   * @returns No value.
   */
  private runSelectionCallback(pending: PendingSelectionCallback): void {
    if (!pending.active) {
      return;
    }
    // The same model selection can outlive its DOM surface. A replacement root
    // invalidates work prepared for the old surface even without a selection update.
    const attached = pending.occurrence.isAttached();
    if (
      !this.reactPanel.enabled ||
      this.reactPanel.mountedRoot !== pending.occurrence ||
      !attached
    ) {
      this.cancelSelectionCallback(pending);
    } else {
      // Unregister before invoking: the callback may publish selection or
      // schedule further work, which must not cancel the completed operation.
      pending.active = false;
      if (this.pendingSelectionCallbacks.get(pending.root) === pending) {
        this.pendingSelectionCallbacks.delete(pending.root);
      }
      pending.unsubscribe?.();
      // The caller performs any selection restoration or focus work. This scheduler
      // only guards invocation; it does not restore anything after the callback runs.
      pending.callback();
    }
  }
}
