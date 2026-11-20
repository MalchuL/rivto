import type { InputRoot, PointerInput } from "@chulane/rivto-root";
import type { BlockEditorApi } from "../types";
import type { BlockKeyboardApi } from "../keyboard/types";

/** Portable operations for one occurrence-bound pointer text selection. */
export interface BlockTextSelectionGestureApi {
  /**
   * Captures the fixed endpoint beneath viewport coordinates.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Portable position, or undefined when detached or unresolved.
   */
  readAnchor(x: number, y: number): BlockSelectionPosition | undefined;
  /**
   * Captures a candidate moving endpoint beneath viewport coordinates.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Portable position, or undefined when detached or unresolved.
   */
  readHead(x: number, y: number): BlockSelectionPosition | undefined;
  /**
   * Checks for a captured fixed endpoint.
   *
   * @returns True while the attachment is active and an anchor exists.
   */
  hasAnchor(): boolean;
  /**
   * Checks for a candidate moving endpoint.
   *
   * @returns True while the attachment is active and a candidate exists.
   */
  hasPendingHead(): boolean;
  /**
   * Checks for a published moving endpoint.
   *
   * @returns True while the attachment is active and a head exists.
   */
  hasHead(): boolean;
  /**
   * Publishes or clears the latest candidate endpoint.
   *
   * @param hasHead - Whether to retain the latest candidate.
   * @returns The retained endpoint is updated while the attachment is active.
   */
  commitHead(hasHead: boolean): void;
  /**
   * Replaces the fixed endpoint with a portable selection position.
   *
   * @param position - Block identity and UTF-16 offset.
   * @returns True when both the old and replacement endpoints can be resolved.
   * @throws Propagates browser endpoint resolution or mounting failures.
   */
  setAnchor(position: BlockSelectionPosition): boolean;
  /**
   * Restores the captured directed browser selection.
   *
   * @returns The selection is restored when the attachment and endpoints remain valid.
   * @throws Propagates browser selection failures.
   */
  restore(): void;
}

/** A stable block ID and concrete UTF-16 offset. */
export interface BlockSelectionPosition {
  readonly blockId: string;
  readonly offset: number;
}

/**
 * Mounts neighboring blocks when visual caret movement reaches a rendered edge.
 *
 * The host may synchronously mount a virtualized endpoint before returning.
 *
 * @param blockId - Current rendered block identity.
 * @param direction - Direction in the host's displayed block order.
 * @returns Any available neighboring blocks have been mounted.
 * @throws Propagates host lookup or mounting failures.
 */
export type BlockAdjacentCaretMount = (blockId: string, direction: -1 | 1) => void;
/**
 * Result of resolving a caret target in one editor occurrence.
 *
 * `focus-requested` means the content host was found and its focus was requested;
 * `unmounted` means the block shell is absent; `no-content` means the shell has
 * no owned content host; and `detached` means the editor has no mounted root.
 */
export type BlockCaretFocusResult = "focus-requested" | "unmounted" | "no-content" | "detached";
/** Live offsets after resolving stored coverage against current text length. */
export interface ResolvedBlockRange {
  /** Inclusive UTF-16 start after resolving or clamping stored offsets. */
  readonly startOffset: number;
  /** Exclusive UTF-16 end after resolving or clamping stored offsets. */
  readonly endOffset: number;
  /** Whether invalid stored offsets were replaced by an empty range. */
  readonly invalid: boolean;
}
/** Visible block identity with its host-owned UTF-16 text length. */
export interface SelectionTextBlock {
  /** Stable block ID in the host's visible order. */
  readonly id: string;
  /** Current text length in UTF-16 code units. */
  readonly length: number;
}
/** Stored coverage; end -1 means the current live end of a whole block. */
export interface BlockSelectionRange {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
/** Directed block/text selection in canonical visible order, without canvas metadata. */
export interface BlockSelectionSnapshot {
  readonly type: "selection";
  readonly blocks: readonly BlockSelectionRange[];
  readonly anchorBlockId?: string;
  readonly focusBlockId?: string;
  readonly reversed?: boolean;
}

/** Browser selection operations borrowed by consumers for one editor occurrence. */
export interface BlockBrowserSelectionApi {
  /**
   * Starts a text-selection gesture for the current occurrence.
   *
   * @returns A gesture invalidated on detachment, or undefined while detached.
   */
  createTextSelectionGesture(): BlockTextSelectionGestureApi | undefined;
  /**
   * Reads the block under viewport coordinates in the current occurrence.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Block ID, or undefined when detached or no owned block is hit.
   */
  blockIdAtPoint(x: number, y: number): string | undefined;
  /**
   * Focuses the occurrence for a structural selection and scrolls its block into view.
   *
   * Clears the browser text selection even when the requested block is not mounted.
   * The caller owns mounting and model selection.
   *
   * @param blockId - Stable identity of the selected block.
   * @returns Whether an occurrence was attached and focus was requested.
   * @throws Propagates browser focus, selection, and scrolling failures.
   */
  focusBlockSelection(blockId: string): boolean;
  /**
   * Finds the immediately adjacent editable block within the requested rendered scope.
   *
   * Contentless blocks stop movement. A nearest matching scope is used only
   * when it lies inside the attached occurrence; otherwise the whole occurrence
   * is used. Mounting is attempted only at the edge of the whole occurrence.
   *
   * @param blockId - Current block identity.
   * @param direction - Previous or next rendered block.
   * @param scopeSelector - Selector for a host-defined navigation boundary.
   * @param mountAdjacent - Host operation for mounting neighboring blocks.
   * @returns The adjacent caret position, or undefined when detached, blocked, or at an edge.
   * @throws Propagates invalid selectors and browser or host mounting failures.
   */
  adjacentCaretPosition(
    blockId: string,
    direction: "left" | "right",
    scopeSelector: string,
    mountAdjacent: BlockAdjacentCaretMount,
  ): BlockSelectionPosition | undefined;
  /**
   * Resolves vertical movement using visual lines in the attached occurrence.
   *
   * The mounting callback runs at most once and only at a rendered edge after
   * movement leaves the current block. No selection or focus is changed here.
   *
   * @param position - Current block ID and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @param mountAdjacent - Host capability for mounting neighboring blocks.
   * @returns The nearest position, or undefined when detached, unresolved, or at an edge.
   * @throws Propagates browser measurement and host lookup or mounting failures.
   */
  verticalCaretPosition(
    position: BlockSelectionPosition,
    direction: "up" | "down",
    mountAdjacent: BlockAdjacentCaretMount,
  ): BlockSelectionPosition | undefined;
  /**
   * Reads the current directed browser selection as block IDs and text offsets.
   *
   * @returns Portable selection, or undefined when detached or outside the occurrence.
   */
  readEditorDOMSelection(): BlockSelectionSnapshot | undefined;
  /**
   * Requests focus and places a browser caret in a mounted block's content host.
   *
   * This does not mount blocks or write model selection. The caller can mount an
   * unmounted target before retrying; an existing contentless shell is not mounted again.
   *
   * @param position - Block identity and requested UTF-16 caret offset.
   * @returns `focus-requested` when a content host exists, `unmounted` when its shell is absent,
   * `no-content` when the shell has no owned content host, or `detached` without an occurrence.
   * @throws Propagates browser focus and range failures.
   */
  focusBlock(position: BlockSelectionPosition): BlockCaretFocusResult;
  /**
   * Restores a directed text selection in this attached occurrence.
   *
   * The caller must mount virtualized endpoints before restoration. Structural
   * selections and missing endpoints leave focus and browser selection unchanged.
   *
   * @param selection - Portable block coverage and directed endpoint identities.
   * @returns True when both endpoints were restored, or false when detached or unresolved.
   */
  restoreEditorDOMSelection(selection: BlockSelectionSnapshot): boolean;
  /**
   * Checks whether a virtualized occurrence has an unmounted selection endpoint.
   *
   * @param selection - Existing directed selection whose endpoints must be retained.
   * @returns True when virtualization is active and an endpoint is not mounted.
   */
  hasVirtualizedMissingEndpoints(selection: BlockSelectionSnapshot): boolean;
}

/** Selection operations owned by the Page controller during attachment. */
export interface BlockBrowserSelectionOwner extends BlockBrowserSelectionApi {
  /**
   * Binds browser selection to the controller's current mounted occurrence.
   *
   * @param hitTest - Borrowed structural hit testing for the mounted occurrence.
   * @param occurrence - Borrowed Root capability bounding this selection attachment.
   * @returns Idempotent disposer that releases only this attachment.
   * @throws If a selection attachment is already active.
   */
  attach(
    hitTest: BlockSelectionHitTest,
    occurrence: Pick<
      InputRoot,
      | "isAttached"
      | "clearSelection"
      | "focus"
      | "focusTextHost"
      | "readTextSelection"
      | "readTextLength"
      | "restoreTextSelection"
      | "createTextSelectionGesture"
      | "adjacentTextPosition"
      | "verticalTextPosition"
      | "scrollFirstMatchingRegionIntoView"
      | "hasRegionByAttribute"
    >,
  ): () => void;
}

/** One selection browser attachment and its exact mounted occurrence. */
export interface BlockSelectionAttachment {
  readonly hitTest: BlockSelectionHitTest;
  readonly occurrence: Pick<
    InputRoot,
    | "isAttached"
    | "clearSelection"
    | "focus"
    | "focusTextHost"
    | "readTextSelection"
    | "readTextLength"
    | "restoreTextSelection"
    | "createTextSelectionGesture"
    | "adjacentTextPosition"
    | "verticalTextPosition"
    | "scrollFirstMatchingRegionIntoView"
    | "hasRegionByAttribute"
  >;
}

/** Borrowed structural hit testing for one mounted editor occurrence. */
export interface BlockSelectionHitTest {
  /**
   * Resolves the block owned by this occurrence at viewport coordinates.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Block identity, or undefined outside an owned block.
   * @throws Propagates browser hit testing and layout measurement failures.
   */
  readBlockIdAtPoint(x: number, y: number): string | undefined;
}

/** Host selection operations borrowed by optional pointer features. */
export interface BlockSelectionAdapter {
  readonly selection: Pick<
    BlockEditorApi["adapter"]["selection"],
    "get" | "set" | "clear" | "getSelectableBlockIds" | "getTextLength" | "canStartSelection"
  >;
}

/** Pointer behaviors coordinated by the shared gesture state. */
export type BlockPointerSelectionFeature = "click" | "toggle" | "range" | "pointer";

/** Interaction capabilities borrowed by the optional selection implementation. */
export interface BlockPointerSelectionHost {
  readonly pointer: BlockEditorApi["pointer"];
  readonly events: Pick<BlockEditorApi["events"], "register" | "observe" | "onDetach">;
  readonly keyboard: Pick<BlockEditorApi["keyboard"], "capture" | "isHeld">;
  readonly browserSelection: Pick<
    BlockEditorApi["browserSelection"],
    "readEditorDOMSelection" | "createTextSelectionGesture" | "blockIdAtPoint"
  >;
  readonly adapter: BlockSelectionAdapter;
}

/** Pointer-down origin and evolving selection, owned by one controller. */
export interface PointerSelection {
  readonly inputRoot: Pick<InputRoot, "isAttached" | "clearSelection" | "focus">;
  readonly scheduleTask: PointerInput["scheduleTask"];
  readonly createAutoScroll: PointerInput["createAutoScroll"];
  readonly startX: number;
  readonly startY: number;
  readonly textGesture: BlockTextSelectionGestureApi;
  readonly anchorPosition: BlockSelectionPosition;
  crossBlock: boolean;
  selection?: BlockSelectionSnapshot;
  wholeBlocks: boolean;
}
/** Latest client coordinates and captured binding evaluated against live keys. */
export interface PointerSelectionCoordinates {
  readonly x: number;
  readonly y: number;
  readonly exact: boolean;
}
/** Combined capabilities borrowed by pointer, native and feedback selection. */
export interface BlockSelectionHost extends BlockPointerSelectionHost {
  readonly keyboard: Pick<BlockKeyboardApi, "capture" | "isHeld" | "subscribeHeld" | "subscribe">;
  readonly browserSelection: Pick<
    BlockBrowserSelectionApi,
    | "readEditorDOMSelection"
    | "hasVirtualizedMissingEndpoints"
    | "createTextSelectionGesture"
    | "blockIdAtPoint"
  >;
}

/** Directed concrete endpoints recovered from stored coverage. */
export interface BlockSelectionEndpointPair {
  readonly anchor: BlockSelectionPosition;
  readonly head: BlockSelectionPosition;
}

/** Independently installable pointer-selection capabilities sharing one gesture state. */
export type BlockSelectionFeature = BlockPointerSelectionFeature | "native" | "feedback";
/** Host semantic binding identities; Page supplies no default key assignments. */
export interface BlockSelectionBindings {
  readonly toggle: string;
  readonly range: string;
  readonly exact: string;
}
