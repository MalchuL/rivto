import type { EditorPosition, Selection } from "@chulane/rivto";
import type { ContentInput } from "../events/types";
import type { InputRoot } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../panels/types";
import type {
  EditableBlockDirection,
  StructuralPredecessorAction,
  ViewportSelectionAction,
} from "./types";

/** Selection commands and DOM synchronization for one EditorPanel.
 * The model selection is shared by the document. Reads expose it only in the active
 * panel (or the default panel before activation) and within that panel's subtree,
 * except isBlockSelected, which exposes shared whole-block coverage for rendering. */
export interface PanelSelectionApi {
  /**
   * Executes a structural edit while preserving the selection's viewport position.
   *
   * The operation runs synchronously. Selection and viewport restoration are
   * cancelled when the captured input registration is replaced or detached.
   *
   * @param blockIds - Selected block identities in document order.
   * @param selection - Portable selection captured before the edit.
   * @param inputRoot - Exact input registration that initiated the command.
   * @param inputRegistration - Routing lifetime captured by the initiating input.
   * @param action - Host structural operation to execute synchronously.
   * @returns Whether the action claimed the command, or false if the occurrence is inactive.
   * @throws Propagates browser, selection, mounting, and action failures.
   */
  runWithViewportPreserved(
    blockIds: readonly string[],
    selection: Selection,
    inputRoot: Pick<
      InputRoot,
      | "isAttached"
      | "getElementIdentity"
      | "readRegionViewportTop"
      | "readRegionValues"
      | "measureRegionViewportBounds"
      | "captureDocumentScroll"
      | "observeWindowWheel"
      | "captureFrameClock"
    >,
    inputRegistration: PanelInputRegistration,
    action: ViewportSelectionAction,
  ): boolean;
  /** @returns A detached selection, or undefined when empty or owned by another panel. */
  get(): Selection | undefined;
  /**
   * Writes the document's shared selection without activating or focusing this panel.
   * @param selection - Selection to publish. A block outside this panel's subtree clears it instead.
   */
  set(selection: Selection): void;
  /** Clears the document's shared selection, including selection last set by another panel. */
  clear(): void;
  /**
   * Subscribes to changes of the document's shared model selection.
   * @param listener - Called after effective selection changes, including changes in other panels.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): () => void;
  /** Deletes the selected content through core when this panel owns the selection; otherwise does nothing. */
  delete(): void;
  /** Returns the shared immutable selection snapshot, retaining identity until selection changes.
   * Returns undefined when empty, outside this subtree, or owned by another panel.
   * Use get() when a detached copy is needed; do not mutate this snapshot. */
  snapshot(): Selection | undefined;
  /**
   * Reads whole-block coverage shared by all panels of this document.
   *
   * Coverage does not depend on the active panel or containment of the complete
   * selection; it does not grant ownership for commands or DOM restoration.
   *
   * @param id - Document-local block identifier.
   * @returns Whether the shared structural selection covers the block. Carets
   * and text ranges return false.
   */
  isBlockSelected(id: string): boolean;
  /** @param id - Element identifier. @returns Whether the element is selected. */
  isElementSelected(id: string): boolean;
  /** Reads text endpoints inside this panel's root; returns undefined without a root or valid DOM selection. */
  readDOM(): Selection | undefined;
  /**
   * Reads selectable block order for the attached Page occurrence.
   *
   * @returns Ordered block IDs, or undefined when this panel has no matching Page attachment.
   * @throws Propagates failures from the Page selection projection.
   */
  selectableBlockIds(): readonly string[] | undefined;
  /**
   * Resolves the current content host of a rendered block in this occurrence.
   *
   * The result exposes caret and geometry reads without exposing the browser
   * element. It does not mount offscreen blocks or change model selection.
   *
   * @param blockId - Persisted block identity within the receiving occurrence.
   * @returns Content capability, or undefined when detached, unrendered, or contentless.
   * @throws Propagates browser lookup failures.
   */
  contentInput(blockId: string): ContentInput | undefined;
  /**
   * Runs an edit and focuses its current navigation scope after a structural predecessor.
   *
   * The predecessor must be rendered within the current card or panel and have
   * no directly owned editable content. The originating attachment is checked
   * before the edit and before clearing browser selection and requesting focus.
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
  ): boolean;
  /**
   * Finds the adjacent rendered editable block for a keyboard edit.
   *
   * Edgeless navigation stays in the current card. A contentless neighbor
   * stops traversal; Page may mount a virtualized neighbor at a rendered edge.
   *
   * @param blockId - Current block identity.
   * @param direction - Whether to find the previous or next block.
   * @returns Neighbor identity, or undefined when detached, unavailable, or blocked.
   * @throws Propagates browser lookup and synchronous mounting failures.
   */
  adjacentEditableBlockId(blockId: string, direction: EditableBlockDirection): string | undefined;
  /**
   * Checks whether a rendered block has a rendered parent in this panel.
   *
   * Nested panels are separate occurrences. This lookup does not mount blocks.
   *
   * @param blockId - Persisted identity of the block to inspect.
   * @returns True for a rendered nested block; false for roots, missing blocks, or detached panels.
   * @throws Propagates browser lookup failures.
   */
  isRenderedBlockNested(blockId: string): boolean;
  /**
   * Requests focus and places a collapsed browser caret in a block's content host.
   *
   * An unmounted block is offered to this occurrence's surface for mounting;
   * an existing contentless shell is not remounted. This does not change model selection.
   *
   * @param blockId - Persisted block identity within this panel.
   * @param offset - Requested UTF-16 offset; browser placement clamps it to content.
   * @returns True when a content host was found and focus requested, even without a browser selection;
   * false when detached or unavailable.
   * @throws Propagates synchronous mounting, browser focus, and range failures.
   */
  focusBlock(blockId: string, offset: number): boolean;
  /**
   * Moves the caret to the nearest top-level Page occurrence in document order.
   *
   * Nested editors are excluded. The target occurrence can mount its boundary block.
   *
   * @param direction - Whether to focus the preceding or following Page occurrence.
   * @returns True when a boundary content host was focused; false when detached or unavailable.
   * @throws Propagates browser lookup, mounting, focus, or range failures.
   */
  focusAdjacentEditor(direction: "up" | "down"): boolean;
  /**
   * Mounts and reveals a structurally selected block while focusing this panel.
   *
   * Clears the browser text range without changing model selection.
   *
   * @param blockId - Persisted identity of the selected block.
   * @returns Whether the attached occurrence received a focus request.
   * @throws Propagates mounting and browser focus or scrolling failures.
   */
  focusBlockSelection(blockId: string): boolean;
  /**
   * Finds the immediately adjacent editable caret position in this occurrence.
   *
   * Edgeless navigation stays inside the current card. A contentless neighbor
   * stops the move; whole-surface edges may mount an offscreen neighbor.
   *
   * @param blockId - Current block identity.
   * @param direction - Previous or next rendered block.
   * @returns Neighboring position, or undefined when detached, blocked, or at an edge.
   * @throws Propagates browser lookup and synchronous mounting failures.
   */
  adjacentCaretPosition(blockId: string, direction: "left" | "right"): EditorPosition | undefined;
  /**
   * Resolves vertical movement using the current occurrence's visual text lines.
   *
   * Adjacent editable blocks may be mounted synchronously at the edge of a block.
   * This does not change model selection or focus.
   *
   * @param position - Current block ID and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @returns Nearest position, or undefined when detached, unresolved, or at an edge.
   * @throws Propagates browser measurement and synchronous mounting failures.
   */
  verticalCaretPosition(
    position: EditorPosition,
    direction: "up" | "down",
  ): EditorPosition | undefined;
  /**
   * Publishes and restores a directed text selection between two block positions.
   *
   * The current occurrence supplies visible block order, including virtualized
   * blocks. A missing occurrence or endpoint leaves the selection unchanged.
   *
   * @param anchor - Fixed selection endpoint.
   * @param head - Moving selection endpoint.
   * @returns True when a model range was published, even if browser restoration was unavailable.
   * @throws Propagates selection, mounting, and browser restoration failures.
   */
  selectTextRange(anchor: EditorPosition, head: EditorPosition): boolean;
  /**
   * Restores browser text selection inside this panel after rendering.
   * @param selection - Selection to restore; omitted to read this panel's current model selection.
   * @param options - Controls scrolling when mounting virtualized text endpoints.
   * @returns Whether the text endpoints were restored; false without a root or usable selection.
   */
  restoreDOM(selection?: Selection, options?: RestoreDOMSelectionOptions): boolean;
  /**
   * Runs the callback next frame only if the model selection has not changed since scheduling.
   * Reserve callbacks for caret, DOM selection, and associated editing focus;
   * each call replaces previous pending work for the same DOM root even if
   * selection is unchanged. Other panels keep their own pending DOM requests.
   * Keep document mutations and independent UI operations outside this scheduler.
   * @param callback - Work to perform next frame while the scheduled selection remains current.
   * @param onCancel - Optional cleanup when newer state or teardown supersedes the work.
   * @returns Idempotent cancellation for the pending callback.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void;
  /** Whether the current selection has a pending, still-valid callback in the next frame. */
  readonly hasPendingSelectionCallback: boolean;
}

/** Options for rebuilding a portable selection in the live browser DOM. */
export interface RestoreDOMSelectionOptions {
  /** False mounts virtual endpoints without navigating the viewport to them. */
  readonly scroll?: boolean;
}
