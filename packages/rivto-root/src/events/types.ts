import type { KeyboardKeyInput, KeyboardModifiers, KeyboardTarget } from "../keyboard/types";
import type {
  EditableText,
  TextHost,
  TextHostFocusResult,
  TextHostQuery,
  TextSelection,
  TextSelectionGesture,
  TextNavigationMount,
  TextSelectionPosition,
  TextSelectionQuery,
  TextOwnerObserver,
  TextOwnerScope,
  ContentViewport,
} from "../text/types";
import type {
  LineOverlay,
  LineOverlayStyle,
  PathOverlay,
  PathOverlayStyle,
  RectangleOverlay,
  RectangleOverlayStyle,
  TextOverlay,
} from "../overlay/types";
import type {
  DocumentScroll,
  FrameClock,
  RegionBounds,
  RegionPoint,
  RegionSize,
  RegionBoundsObserver,
  RegionLayout,
  RegionViewportSnapshot,
  WindowWheelObserver,
} from "../geometry/types";

/**
 * Stable opaque identity of an input region; it does not keep the region alive.
 *
 * Identity describes the region, not its mounting occurrence. Obtain operations
 * from the current Root and observe that Root's attachment lifetime separately.
 */
export class RegionIdentity {
  declare private readonly regionIdentityBrand: never;
}

/** Opaque browser hit retained only for synchronous input resolution. */
export interface InputHit {
  readonly type: "input-hit";
  /**
   * Checks whether the hit still retains a connected browser target.
   *
   * @returns False after release or target disconnection.
   */
  isCurrent(): boolean;
  /**
   * Finds the closest matching ancestor of this connected hit.
   *
   * @param selector - Selector identifying the ancestor.
   * @returns Opaque identity, or undefined when the hit is stale or no ancestor matches.
   * @throws If the browser rejects the selector.
   */
  getNearestAncestorIdentity(selector: string): RegionIdentity | undefined;
  /**
   * Releases the browser target retained for this hit.
   *
   * @returns This hit can no longer resolve a browser target; repeated release is harmless.
   */
  release(): void;
}

/** Hit testing bound to the document captured from an occurrence. */
export interface InputDocument {
  /**
   * Checks whether the originating occurrence remains connected to this document.
   *
   * @returns False after detachment, replacement, disconnection, or document adoption.
   * @throws Propagates occurrence ownership checks.
   */
  isCurrent(): boolean;
  /**
   * Reuses a connected hit from this document or captures the element at a point.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @param hint - Optional borrowed hit from the same browser document.
   * @returns The borrowed hint, a new hit the caller must release, or undefined when unavailable.
   * @throws Propagates browser hit testing and occurrence ownership failures.
   */
  captureHit(x: number, y: number, hint?: InputHit): InputHit | undefined;
}

/** Focus behavior for an attached occurrence. */
export interface InputFocusOptions {
  /** Prevent browser scrolling while focusing; defaults to true. */
  readonly preventScroll?: boolean;
}

/** Browser operations bound to one mounted occurrence. */
export interface InputRoot {
  /**
   * Creates one shared input observer for this attachment.
   *
   * Registrations on the observer share a dispatch identity across their input
   * phases. The caller owns the observer and must dispose it, including after
   * the Root detaches.
   *
   * @returns An attached observer, or undefined when this Root is detached.
   * @throws Propagates listener attachment and rollback failures.
   */
  createInputObserver(): InputObserver | undefined;
  /**
   * Captures the current document for cross-occurrence hit testing.
   *
   * @returns Document capability, or undefined when this occurrence is not connected.
   * @throws Propagates occurrence ownership checks.
   */
  captureDocument(): InputDocument | undefined;
  /**
   * Captures a point hit and its owning region, projecting nested occurrences onto their enclosing owner.
   *
   * @param query - Viewport coordinates and selectors defining owners and occurrence boundaries.
   * @returns Opaque hit and owner regions, or undefined outside this attachment or after replacement.
   * @throws Propagates browser hit testing, selector, and ownership failures.
   */
  capturePoint(query: RegionPointQuery): RegionPointHit | undefined;
  /**
   * Resolves an opaque element identity inside this occurrence.
   *
   * @param identity - Identity previously obtained from a browser region.
   * @param isCurrent - Optional borrower lifetime check, evaluated for each region operation.
   * @returns Captured region, or undefined when missing, outside this occurrence, or detached.
   * @throws Propagates ownership checks.
   */
  captureRegionByIdentity(
    identity: RegionIdentity,
    isCurrent?: () => boolean,
  ): InputRegion | undefined;
  /**
   * Requests focus on the occurrence-owned region identified by an opaque identity.
   *
   * The request prevents scrolling by default and is ignored for disconnected, foreign, or
   * non-HTML regions. An optional boundary excludes nested occurrences. Focus
   * handlers may synchronously end this attachment.
   *
   * @param identity - Identity previously captured from a browser region or mount.
   * @param boundarySelector - Optional selector identifying nested occurrence boundaries.
   * @param options - Optional focus behavior; scrolling is prevented by default.
   * @returns True when focus was requested and ownership remains current; false otherwise.
   * @throws Propagates focus-option, browser focus, and ownership-check failures.
   */
  focusRegionByIdentity(
    identity: RegionIdentity,
    boundarySelector?: string,
    options?: InputFocusOptions,
  ): boolean;
  /**
   * Captures an occurrence-owned editable host by its opaque mount identity.
   *
   * Nested occurrences are excluded. The returned operations stop when the
   * Root detaches, the host moves, or its occurrence boundary changes.
   *
   * @param identity - Identity obtained at the host's mounting boundary.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Editing capability, or undefined for a missing, foreign, or non-HTML host.
   * @throws Propagates selector and ownership-check failures.
   */
  captureEditableTextByIdentity(
    identity: RegionIdentity,
    boundarySelector: string,
  ): EditableText | undefined;
  /**
   * Captures the matching owner of focus within this occurrence.
   *
   * When a boundary selector is supplied, nested occurrences are excluded. The region becomes inactive when focus
   * moves, its owner changes, or the Root detaches.
   *
   * @param selector - Selector identifying the focused target's owner.
   * @param boundarySelector - Optional selector identifying nested occurrences to exclude.
   * @returns Focused owner region, or undefined when detached, outside this occurrence, or without a matching owner.
   * @throws Propagates browser focus, selector, and ownership failures.
   */
  captureFocusedRegion(selector: string, boundarySelector?: string): InputRegion | undefined;
  /**
   * Temporarily replaces an attribute on the mounted occurrence.
   *
   * Cleanup restores the preceding active owner or original value even after
   * detachment, without overwriting a newer owner's value.
   *
   * @param name - Attribute to replace on this occurrence.
   * @param value - Value retained until the cleanup runs.
   * @returns Idempotent cleanup, or a no-op when detached.
   * @throws Propagates mutation or cleanup failures; AggregateError retains a failed rollback.
   */
  setTemporaryAttribute(name: string, value: string): () => void;
  /**
   * Reads the viewport dimensions of this occurrence's current browser window.
   *
   * @returns Width and height in CSS pixels, or undefined when detached or windowless.
   * @throws Propagates browser window and attachment-check failures.
   */
  readViewport(): ContentViewport | undefined;
  /**
   * Observes normalized input delivered to this occurrence, including nested surfaces.
   *
   * The observer runs on the root in the bubbling phase, so nested input must
   * bubble to reach it. Document and window events are not observed here. The
   * caller owns the subscription and releases it even after detachment.
   *
   * @param type - Input name to observe on the occurrence.
   * @param observer - Receives normalized input during its browser delivery.
   * @returns An idempotent disposer, or undefined if the occurrence is detached.
   * @throws Propagates attachment, browser listener installation, and disposer failures.
   */
  observeInput<K extends keyof BrowserInputMap>(
    type: K,
    observer: (input: BrowserInputMap[K]) => void,
  ): (() => void) | undefined;
  /**
   * Creates an inert line overlay capability for this occurrence.
   *
   * @param style - CSS class and thickness used to present the line.
   * @returns An uncreated line whose cleanup remains available after detachment.
   */
  createLineOverlay(style: LineOverlayStyle): LineOverlay;
  /**
   * Creates a document path capability bound to this occurrence.
   *
   * @param style - CSS class and data markers used to present the path.
   * @returns An uncreated overlay that can be removed after detachment.
   */
  createPathOverlay(style: PathOverlayStyle): PathOverlay;
  /**
   * Creates a rectangle bound to this occurrence without exposing its element.
   *
   * @param style - Container, CSS class, properties and data markers used to present the rectangle.
   * @returns An uncreated overlay that can be removed after detachment.
   */
  createRectangleOverlay(style: RectangleOverlayStyle): RectangleOverlay;
  /**
   * Creates an inert text overlay capability for this occurrence.
   *
   * @returns An uncreated overlay whose cleanup remains available after detachment.
   */
  createTextOverlay(): TextOverlay;
  /**
   * Captures a document attribute for work owned by this occurrence.
   *
   * Cleanup remains bound to the captured document after detachment or a move.
   *
   * @param name - Attribute on the document element.
   * @returns Operations for setting and conditionally removing that attribute.
   */
  captureDocumentAttribute(name: string): DocumentAttribute;
  /**
   * Captures the focused text host in this occurrence without exposing its element.
   *
   * @param selector - Selector that the focused host must match.
   * @param boundarySelector - Selector identifying nested occurrences.
   * @returns Focused host, or undefined when focus, ownership, or attachment has changed.
   * @throws If the browser rejects a selector or an attachment check fails.
   */
  captureFocusedTextHost?(selector: string, boundarySelector: string): TextHost | undefined;
  /**
   * Finds a rendered content host using caller-supplied ownership selectors.
   *
   * Browser roots provide this capability; other providers may omit it.
   *
   * @param query - Selectors and owner identity used to locate the host.
   * @returns Captured host, or undefined when unavailable or detached.
   * @throws If the browser rejects an evaluated selector.
   */
  findTextHost?(query: TextHostQuery): TextHost | undefined;
  /**
   * Focuses a directly owned content host and places a collapsed browser caret.
   *
   * Only the first matching owner is considered. The caller's currentness check
   * bounds the operation to its own attachment, which may end while Root remains
   * active. This operation does not mount content or change model selection.
   *
   * @param query - Selectors and identity identifying the owner and its content.
   * @param offset - Requested UTF-16 text offset; negative values clamp to zero.
   * @param isCurrent - Checks whether the caller's originating attachment remains current.
   * @returns Whether focus was requested, the owner or content was missing, or the attachment ended.
   * @throws Propagates selector, ownership, browser focus and range failures.
   */
  focusTextHost(
    query: TextHostQuery,
    offset: number,
    isCurrent: () => boolean,
  ): TextHostFocusResult;
  /**
   * Reads the directed browser text selection owned by this occurrence.
   *
   * Both endpoints must resolve to content inside this occurrence, excluding
   * nested occurrences. Anchor and focus preserve browser selection direction.
   *
   * @param query - Selectors identifying content, its owner, and occurrence boundaries.
   * @returns Owner identities and UTF-16 offsets, or undefined when unavailable or detached.
   * @throws Propagates selector, ownership, and browser selection access failures.
   */
  readTextSelection(query: TextSelectionQuery): TextSelection | undefined;
  /**
   * Observes focused and selected owner identities in this occurrence.
   *
   * The observer runs immediately and on focus or browser selection changes.
   * Nested occurrences and selection endpoints outside owned content are excluded.
   * Notifications are not deduplicated: callers can reconcile their own state.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param observer - Receives current unique identities without browser objects.
   * @returns Idempotent disposer releasing the occurrence's browser listeners.
   * @throws Propagates listener installation, browser inspection, observer, and disposer failures.
   */
  observeTextOwners(query: TextSelectionQuery, observer: TextOwnerObserver): () => void;
  /**
   * Reads the current text length of a rendered, occurrence-owned content host.
   *
   * @param query - Owner identity and selectors identifying its content.
   * @returns UTF-16 length, or undefined when the host or occurrence is unavailable.
   * @throws Propagates browser selector and ownership failures.
   */
  readTextLength(query: TextHostQuery): number | undefined;
  /**
   * Restores directed browser selection from owner identities and text offsets.
   *
   * Missing owners may be mounted by the caller; existing contentless owners are
   * not mounted again. Focus and range updates stop if the caller's attachment ends.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param selection - Directed owner identities and UTF-16 offsets to restore.
   * @param mountMissing - Requests mounting of one absent owner when needed.
   * @param isCurrent - Checks whether the caller's originating attachment remains current.
   * @returns True when both endpoints were resolved and restoration was requested.
   * @throws Propagates mounting, selector, focus, and browser range failures.
   */
  restoreTextSelection(
    query: TextSelectionQuery,
    selection: TextSelection,
    mountMissing: (ownerId: string) => void,
    isCurrent: () => boolean,
  ): boolean;
  /**
   * Creates a pointer text-selection gesture bound to this occurrence.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param mountMissing - Requests synchronous mounting of an absent owner.
   * @param isCurrent - Checks the caller's originating attachment.
   * @returns A gesture retaining browser points only while the attachment remains current.
   */
  createTextSelectionGesture(
    query: TextSelectionQuery,
    mountMissing: (ownerId: string) => void,
    isCurrent: () => boolean,
  ): TextSelectionGesture;
  /**
   * Resolves the immediately adjacent content owner within an optional local scope.
   *
   * Contentless owners stop horizontal movement. Only an occurrence-wide scope
   * may request mounting at a rendered edge.
   *
   * @param query - Selectors identifying content, owners, and boundaries.
   * @param ownerId - Current rendered owner identity.
   * @param direction - Previous or next rendered owner.
   * @param scopeSelector - Selector for an optional local navigation boundary.
   * @param mountAdjacent - Requests mounting of an offscreen neighbor.
   * @param isCurrent - Checks the originating caller attachment.
   * @returns Adjacent owner and edge offset, or undefined when unavailable.
   * @throws Propagates browser selector and host mounting failures.
   */
  adjacentTextPosition(
    query: TextSelectionQuery,
    ownerId: string,
    direction: "left" | "right",
    scopeSelector: string,
    mountAdjacent: TextNavigationMount,
    isCurrent: () => boolean,
  ): TextSelectionPosition | undefined;
  /**
   * Captures the local scope containing a rendered text owner, or the occurrence.
   *
   * The captured scope is retained independently of later owner removal. A
   * missing owner or a scope outside this occurrence selects the occurrence.
   *
   * @param query - Selectors identifying owners, content, and occurrence boundaries.
   * @param ownerId - Exact identity of the owner used to select the local scope.
   * @param scopeSelector - Selector identifying an optional local scope.
   * @returns Scope capabilities, or undefined if the occurrence detaches during capture.
   * @throws Propagates browser selector, attribute, and attachment-check failures.
   */
  captureTextOwnerScope(
    query: TextSelectionQuery,
    ownerId: string,
    scopeSelector: string,
  ): TextOwnerScope | undefined;
  /**
   * Finds an adjacent top-level occurrence in this occurrence's document.
   *
   * Matches nested inside another matching occurrence are excluded. The
   * The returned capability is tied to the source attachment and the destination
   * element in this document; it does not establish destination registration.
   *
   * @param selector - Selector identifying occurrences in document order.
   * @param direction - Whether to find the previous or next occurrence.
   * @returns Adjacent occurrence, or undefined when absent or detached.
   * @throws Propagates selector and attachment-check failures.
   */
  findAdjacentOccurrence(
    selector: string,
    direction: "previous" | "next",
  ): AdjacentOccurrence | undefined;
  /**
   * Resolves vertical movement by measuring rendered visual lines.
   *
   * The host may mount one neighboring owner when movement leaves the current
   * owner at a rendered edge. This does not change focus or model selection.
   *
   * @param query - Selectors identifying content, owners, and boundaries.
   * @param position - Current owner identity and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @param mountAdjacent - Requests mounting of an offscreen neighbor.
   * @param isCurrent - Checks the originating caller attachment.
   * @returns Nearest visual-line position, or undefined when unavailable.
   * @throws Propagates browser measurement and host mounting failures.
   */
  verticalTextPosition(
    query: TextSelectionQuery,
    position: TextSelectionPosition,
    direction: "up" | "down",
    mountAdjacent: TextNavigationMount,
    isCurrent: () => boolean,
  ): TextSelectionPosition | undefined;
  /**
   * Identifies the underlying occurrence element without exposing it.
   *
   * The identity is stable if that element is remounted and does not establish
   * that this attachment is active. Browser roots provide this query; other
   * providers may omit it.
   *
   * @returns Opaque element identity; check `isAttached` before using an occurrence.
   */
  getElementIdentity?(): RegionIdentity;
  /**
   * Checks whether this exact occurrence remains attached.
   *
   * A later mount, even on the same element, does not reactivate this capability.
   *
   * @returns Whether the originating attachment is still active.
   */
  isAttached(): boolean;
  /**
   * Checks whether this occurrence is attached and connected to a document.
   *
   * @returns False after replacement, detachment, or browser disconnection.
   * @throws Propagates attachment ownership checks.
   */
  isConnected(): boolean;
  /**
   * Compares this occurrence's document with an active input region.
   *
   * @param region - Region belonging to another occurrence or this one.
   * @returns False when either attachment is inactive, disconnected, or in another document.
   * @throws Propagates attachment and region ownership checks.
   */
  isInSameDocument(region: InputRegion): boolean;
  /**
   * Reads a surface attribute while this exact occurrence remains attached.
   *
   * If reading synchronously replaces the attachment, the value is discarded.
   *
   * @param name - Attribute name on the mounted surface.
   * @returns Current value, including an empty string, or undefined when absent or detached.
   * @throws If the browser rejects the attribute name or the owner check fails.
   */
  readAttribute(name: string): string | undefined;
  /**
   * Finds matching regions owned by this occurrence without exposing elements.
   *
   * Each region remains usable only while this exact attachment is active and
   * the element remains in the occurrence and continues matching the selector.
   * Nested boundaries are excluded.
   *
   * @param selector - Selector for regions to find inside the occurrence.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Captured regions in document order, or an empty list after detachment.
   * @throws If the browser rejects an evaluated selector.
   */
  findRegions(selector: string, boundarySelector: string): readonly InputRegion[];
  /**
   * Visits matching regions without matching ancestors in this occurrence.
   *
   * Regions are visited in document order and nested occurrences are excluded.
   * The walk stops when the predicate returns true.
   *
   * @param selector - Selector identifying regions and their matching ancestors.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @param predicate - Synchronous test for each top-level region.
   * @returns Whether the predicate matched, or undefined if ownership changes during the walk.
   * @throws Propagates selector, predicate, and ownership failures.
   */
  someTopLevelRegion(
    selector: string,
    boundarySelector: string,
    predicate: RegionPredicate,
  ): boolean | undefined;
  /**
   * Captures the first directly owned region for each requested attribute value.
   *
   * Results follow document order and nested occurrences are excluded. Once a
   * value is found, later regions with the same value are ignored.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Exact values to capture, including unmounted values.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Matching regions in document order, or an empty list when detached.
   * @throws Propagates browser selector and ownership failures.
   */
  findRegionsByAttribute(
    attribute: string,
    values: readonly string[],
    boundarySelector: string,
  ): readonly InputRegion[];
  /**
   * Checks for an occurrence-owned descendant with an exact attribute value.
   *
   * Descendants of nested occurrences are excluded.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact attribute value to find.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns True if a match remains owned; false when missing or detached.
   * @throws Propagates selector evaluation and attachment-check failures.
   */
  hasRegionByAttribute(attribute: string, value: string, boundarySelector: string): boolean;
  /**
   * Checks whether a matching region has a matching ancestor in its occurrence.
   *
   * Regions are considered in document order; nested occurrence boundaries are
   * excluded. The region identity is compared as an attribute value, not CSS.
   *
   * @param query - Region selector, identity, ancestor selector, and occurrence boundary.
   * @returns False when the region or ancestor is missing or the occurrence detaches.
   * @throws Propagates browser selector, attribute, and attachment-check failures.
   */
  hasRegionAncestor(query: RegionAncestorQuery): boolean;
  /**
   * Reads the viewport top of the first descendant with an exact attribute value.
   *
   * The result is discarded if this occurrence detaches during the lookup or
   * measurement. Descendants of nested occurrences are included.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact attribute value of the desired region.
   * @returns Viewport top in CSS pixels, or undefined when missing or detached.
   * @throws Propagates selector evaluation, measurement, and attachment-check failures.
   */
  readRegionViewportTop(attribute: string, value: string): number | undefined;
  /**
   * Reads unique matching descendant attribute values in document order.
   *
   * Descendants of nested occurrences are included; detachment discards the read.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Values to include; empty or absent attributes are ignored.
   * @returns Unique matching values, or an empty list when detached or unmatched.
   * @throws Propagates selector evaluation and attachment-check failures.
   */
  readRegionValues(attribute: string, values: readonly string[]): readonly string[];
  /**
   * Measures matching descendant regions relative to the viewport.
   *
   * Descendants of nested occurrences and duplicate values are retained in DOM
   * order. Detachment during the read discards the complete snapshot.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Values to measure; empty or absent attributes are ignored.
   * @returns Viewport height and matching bounds, or undefined when detached.
   * @throws Propagates selector evaluation, measurement, and attachment-check failures.
   */
  measureRegionViewportBounds(
    attribute: string,
    values: readonly string[],
  ): RegionViewportSnapshot | undefined;
  /**
   * Captures the current document's scrolling element without exposing it.
   *
   * The captured capability remains bound to that element and stops adjusting
   * it when this occurrence detaches or moves to a different document.
   *
   * @returns Scroll adjustment capability, or undefined when unavailable or detached.
   * @throws Propagates browser document access and attachment-check failures.
   */
  captureDocumentScroll(): DocumentScroll | undefined;
  /**
   * Observes vertical wheel movement anywhere in this occurrence's window.
   *
   * The passive listener is bounded by this Root and its captured document.
   * Deltas retain browser-reported units and are not converted to CSS pixels.
   *
   * @param observer - Receives each vertical delta without a browser event.
   * @returns Idempotent disposer removing this observation.
   * @throws Propagates listener installation, delivery, and cleanup failures.
   */
  observeWindowWheel(observer: WindowWheelObserver): () => void;
  /**
   * Observes normalized input in this occurrence's captured browser window.
   *
   * Delivery stops after detachment or document movement. The caller owns the
   * returned subscription and can release it after either event.
   *
   * @param type - Root-supported input name to observe.
   * @param phase - Capture or bubble phase of the window listener.
   * @param observer - Receives normalized input during its browser delivery.
   * @returns Idempotent listener cleanup, or a no-op when no window is available.
   * @throws Propagates listener setup, observation, and cleanup failures.
   */
  observeWindowInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: WindowInputPhase,
    observer: (input: BrowserInputMap[K]) => void,
  ): () => void;
  /**
   * Observes normalized input in this occurrence's captured document.
   *
   * Delivery stops after detachment or document adoption; the caller still owns
   * the returned listener cleanup. Input outside the occurrence is included.
   *
   * @param type - Root-supported input name to observe.
   * @param phase - Capture or bubble phase on the document.
   * @param observer - Receives normalized input during synchronous delivery.
   * @returns Idempotent listener cleanup, or a no-op when the Root is detached.
   * @throws Propagates listener setup, observation, and cleanup failures.
   */
  observeDocumentInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: "capture" | "bubble",
    observer: (input: BrowserInputMap[K]) => void,
  ): () => void;
  /**
   * Writes clipboard formats through this occurrence's browser document.
   *
   * @param formats - Format values and the subset used by asynchronous writes.
   * @returns A promise resolving after the browser accepts the write.
   * @throws If this Root is detached or the browser write fails.
   */
  writeClipboard(formats: ClipboardWriteFormats): Promise<void>;
  /**
   * Captures frame timing and scheduling for this occurrence's window.
   *
   * Accepted callbacks can run after detachment so owners can release pending
   * resources. New requests and clock reads stop when the Root is no longer current.
   *
   * @returns Frame clock, or undefined when detached or no window is available.
   * @throws Propagates browser document access and attachment-check failures.
   */
  captureFrameClock(): FrameClock | undefined;
  /**
   * Scrolls the first matching region owned directly by this occurrence into view.
   *
   * Nested occurrences are excluded. The browser scrolls only as far as needed,
   * and a detached occurrence or missing match leaves the viewport unchanged.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact attribute value of the region to reveal.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns The first owned match is scrolled when the occurrence remains active.
   * @throws If browser selector evaluation, ownership checks, or scrolling fail.
   */
  scrollFirstMatchingRegionIntoView(
    attribute: string,
    value: string,
    boundarySelector: string,
  ): void;
  /**
   * Temporarily disables browser scroll anchoring on this occurrence.
   *
   * Overlapping suspensions share the original inline style. Cleanup restores it
   * after the last suspension, including when this Root has detached.
   *
   * @returns Idempotent cleanup, or a no-op if the occurrence is detached.
   * @throws Propagates attachment checks and browser style failures.
   */
  suspendScrollAnchoring(): () => void;
  /**
   * Checks whether this occurrence or one of its descendants has browser focus.
   *
   * @returns False when detached or when focus is outside the occurrence.
   * @throws Propagates browser focus inspection failures.
   */
  hasFocus(): boolean;
  /**
   * Checks whether browser focus is on the occurrence surface itself.
   *
   * @returns False when detached or when focus is on a descendant or elsewhere.
   * @throws Propagates browser focus inspection failures.
   */
  isFocused(): boolean;
  /**
   * Clears browser selection ranges in this occurrence's document.
   *
   * This does not mutate editor selection. After detachment it is a no-op.
   *
   * @returns Existing browser ranges have been removed when selection is available.
   * @throws Propagates browser selection access or range-removal failures.
   */
  clearSelection(): void;
  /**
   * Requests focus on this occurrence, preventing scroll by default.
   *
   * After detachment this is a no-op, including after the same element is remounted.
   *
   * @param options - Optional focus behavior; omitted properties retain their defaults.
   * @returns Focus has been requested when the occurrence is still attached.
   * @throws Propagates browser focus failures.
   */
  focus(options?: InputFocusOptions): void;
}

/** Selectors and identity used to inspect one rendered region's ancestry. */
export interface RegionAncestorQuery {
  /** Selector matching the region to inspect. */
  readonly regionSelector: string;
  /** Attribute carrying the region's identity. */
  readonly identityAttribute: string;
  /** Exact identity value, including any CSS-special characters. */
  readonly identity: string;
  /** Selector matching the ancestor to find. */
  readonly ancestorSelector: string;
  /** Selector identifying occurrence boundaries. */
  readonly boundarySelector: string;
}

/** Browser-free access to an adjacent occurrence element in one document. */
export interface AdjacentOccurrence {
  /** Opaque identity of the destination element, independent of its attachment. */
  readonly identity: object;
  /**
   * Checks whether source and destination still belong to the captured document.
   *
   * @returns False after source detachment, element removal, or movement into a nested occurrence.
   * @throws Propagates selector and attachment-check failures.
   */
  isCurrent(): boolean;
  /**
   * Finds the first or last directly owned content host in the destination.
   *
   * Contentless owners are skipped and nested occurrence owners are excluded.
   *
   * @param query - Selectors identifying owners, content, and occurrence boundaries.
   * @param edge - First or last editable owner to inspect.
   * @returns Owner identity and UTF-16 edge offset, or undefined when unavailable or stale.
   * @throws Propagates selector, attribute, and attachment-check failures.
   */
  readEdgeTextPosition(
    query: TextSelectionQuery,
    edge: "first" | "last",
  ): TextSelectionPosition | undefined;
}

/** Document-level presentation state bound to the document captured by an occurrence. */
export interface DocumentAttribute {
  /**
   * Sets the attribute to an empty value while the originating occurrence remains connected.
   *
   * @returns True when the attribute was written, or false when the occurrence is no longer current.
   * @throws If ownership checks or the browser attribute write fail.
   */
  set(): boolean;
  /**
   * Removes the attribute only when the captured document has no matching elements.
   *
   * This cleanup remains available after the originating occurrence is detached.
   *
   * @param selector - Selector identifying elements that still require the attribute.
   * @returns The attribute is removed when no matching element remains.
   * @throws If the selector is invalid or browser inspection or mutation fails.
   */
  removeWhenAbsent(selector: string): void;
}

/** An occurrence that can inspect focus without crossing a nested boundary. */
export interface FocusBoundaryInputRoot extends InputRoot {
  /**
   * Checks whether current browser focus belongs directly to this occurrence.
   *
   * A closest matching boundary other than this root belongs to a nested
   * occurrence. A released attachment cannot report focus from a later mount.
   * Focus changes during boundary lookup discard the earlier result.
   *
   * @param boundarySelector - Selector identifying nested occurrence boundaries.
   * @returns True when focus is inside this attached occurrence without crossing a boundary.
   * @throws If the browser rejects the selector or an attachment check fails.
   */
  hasFocusWithin(boundarySelector: string): boolean;
}

/** Browser root operations including live document connectivity. */
export interface BrowserInputRootApi extends InputRoot {
  /**
   * Checks whether the occurrence's document currently owns browser focus.
   *
   * @returns False when the registration is inactive or the document lacks focus.
   * @throws Propagates attachment and browser focus inspection failures.
   */
  isDocumentFocused(): boolean;
}

/**
 * Queries the event target's ancestry without exposing a browser element.
 *
 * These capabilities are provided for synchronous event delivery. Do not retain
 * them as a substitute for stable model IDs or a later document lookup.
 */
export interface InputTarget {
  /**
   * Identifies the nearest matching ancestor without exposing its element.
   *
   * Browser targets provide this query; other providers may omit it. The returned
   * identity describes an element rather than an active attachment.
   *
   * @param selector - Selector identifying the ancestor.
   * @returns Opaque identity, or undefined when no ancestor matches.
   * @throws If the browser rejects the selector.
   */
  getNearestAncestorIdentity?(selector: string): object | undefined;
  /**
   * Compares the nearest matching target ancestor with an occurrence root.
   *
   * Browser targets provide this query; other providers may omit it. The
   * supplied root must be a currently attached browser occurrence.
   *
   * @param selector - Selector identifying occurrence boundaries.
   * @param root - Borrowed occurrence to compare without exposing its element.
   * @returns True when the nearest match is the supplied active occurrence.
   * @throws If the browser rejects the selector or the root owner check fails.
   */
  isNearestAncestorRoot?(selector: string, root: InputRoot): boolean;
  /**
   * Checks whether the original target is an element in the occurrence's browser realm.
   *
   * Browser-provided targets support this query; other providers may omit it.
   *
   * @returns False for text nodes and targets from another realm.
   */
  isElement?(): boolean;
  /**
   * Captures the original connected element during the current input delivery.
   *
   * Pointer capture does not change this operation's target. Text targets and
   * disconnected elements are excluded; release the hit after synchronous use.
   *
   * @returns Opaque hit, or undefined when the target or delivery is unavailable.
   * @throws Propagates browser target and ownership-check failures.
   */
  captureTargetHit(): InputHit | undefined;
  /**
   * Captures the original connected element when pointer capture has not redirected input.
   *
   * Text targets and disconnected elements are excluded. The capture state is
   * read live, so call this during the current pointer delivery.
   *
   * @param pointerId - Pointer whose capture state is inspected during delivery.
   * @returns Opaque hit to release after use, or undefined for text, disconnected, or captured targets.
   * @throws Propagates browser pointer-capture inspection failures.
   */
  captureUncapturedPointerHit(pointerId: number): InputHit | undefined;
  /**
   * Checks whether the original input target is the receiving root itself.
   *
   * A text node directly inside the root is distinct from the root.
   *
   * @returns True only when the native target is the attached root.
   */
  isRoot(): boolean;
  /**
   * Checks whether the target belongs to this attached occurrence.
   *
   * When a boundary selector is supplied, its closest match must be the root
   * itself; a nested matching boundary belongs to another occurrence.
   *
   * @param boundarySelector - Optional selector identifying occurrence boundaries.
   * @returns Whether the target is inside the root without crossing a nested boundary.
   * @throws If the browser rejects an evaluated selector.
   */
  belongsToRoot(boundarySelector?: string): boolean;
  /**
   * Checks whether the target or an ancestor matches a host-provided selector.
   *
   * @param selector - Browser selector identifying the host's input region.
   * @returns Whether an ancestor matches.
   * @throws If the selector is invalid.
   */
  hasAncestor(selector: string): boolean;
  /**
   * Checks another selector against the closest matching target or ancestor.
   *
   * @param selector - Selector used to find the closest ancestor.
   * @param matchingSelector - Selector tested only against that ancestor.
   * @returns Whether the closest ancestor matches, or undefined when none exists.
   * @throws If either selector is invalid and the browser evaluates it.
   */
  closestAncestorMatches(selector: string, matchingSelector: string): boolean | undefined;
  /**
   * Compares the closest ancestors matching two selectors without exposing them.
   *
   * Matching is evaluated live, and either selector may match the target itself.
   *
   * @param firstSelector - Selector identifying the first ancestor.
   * @param secondSelector - Selector identifying the second ancestor.
   * @returns True when both selectors resolve to the same element; false if either is absent.
   * @throws If an evaluated selector is invalid.
   */
  closestAncestorsAreSame(firstSelector: string, secondSelector: string): boolean;
  /**
   * Checks whether the closest matching ancestor inside this occurrence is editable.
   *
   * Non-element event targets, absent matches, and matches outside the occurrence
   * return undefined. Editability is read live, including inherited browser state.
   *
   * @param selector - Selector identifying the ancestor to inspect.
   * @returns Its current editability, or undefined when it cannot be inspected.
   * @throws If the selector is invalid.
   */
  closestAncestorIsEditable(selector: string): boolean | undefined;
  /**
   * Reads an attribute from the closest matching target or ancestor.
   *
   * @param selector - Browser selector identifying the desired ancestor.
   * @param name - Attribute to read from that ancestor.
   * @returns Attribute value, or undefined if the ancestor or attribute is absent.
   * @throws If the selector is invalid.
   */
  ancestorAttribute(selector: string, name: string): string | undefined;
  /**
   * Reads an attribute from the nearest matching ancestor inside this root.
   *
   * @param selector - Selector identifying the ancestor.
   * @param name - Attribute to read.
   * @returns Attribute value, or undefined when the match is absent or outside the root.
   * @throws If the selector is invalid.
   */
  ancestorAttributeWithinRoot(selector: string, name: string): string | undefined;
  /**
   * Checks whether the nearest matching region belongs to the target's nearest owner.
   *
   * Both matches must be inside the receiving root. Nested occurrence boundaries
   * remain the caller's responsibility.
   *
   * @param selector - Selector identifying the region.
   * @param ownerSelector - Selector identifying the region's owner.
   * @returns True when the region and target share the same nearest owner inside the root.
   * @throws If either selector is invalid.
   */
  hasAncestorWithinOwner(selector: string, ownerSelector: string): boolean;
}

/**
 * Shared input data and synchronous delivery capabilities.
 *
 * Default prevention, propagation control and target queries apply to the current
 * delivery. Copy data needed later rather than retaining these capabilities.
 */
export interface InputEvent {
  /** Browser input name. */
  readonly type: string;
  /** Target ancestry capability, absent when the target has no element ancestry. */
  readonly target: InputTarget | null;
  /**
   * Requests cancellation of the browser default for the current delivery.
   *
   * @returns The native default is prevented when the event is cancelable.
   */
  preventDefault(): void;
  /**
   * Requests that native propagation stop after the current target.
   *
   * @returns The browser will not propagate the current event to later targets.
   */
  stopPropagation(): void;
}

/** Focus transition with synchronous access to the other target's ancestry. */
export interface FocusInput<
  Type extends "focusin" | "focusout" = "focusin" | "focusout",
> extends InputEvent {
  /** Browser focus transition name. */
  readonly type: Type;
  /** Previous or next focus target, absent when it has no element ancestry. */
  readonly relatedTarget: InputTarget | null;
  /** Whether the browser supplied another focus target, including non-element targets. */
  readonly hasRelatedTarget: boolean;
  /**
   * Captures a target ancestor for later checks of the current related focus target.
   *
   * The target is fixed for this input delivery, including if the browser event
   * is dispatched again. The matching ancestor is selected once inside the
   * receiving root. Each query reads the current related target and accepts nodes
   * from the root's document realm.
   *
   * @param selector - Selector identifying the ancestor to capture.
   * @returns A query that returns false if the ancestor or related node is absent.
   * @throws If the browser rejects the selector.
   */
  captureRelatedTargetWithinAncestor(selector: string): () => boolean;
}

/** Pointer phases delivered by the browser input adapter. */
export type PointerInputType =
  | "pointerenter"
  | "pointerleave"
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel"
  | "lostpointercapture"
  | "pointerover"
  | "pointerout";

/** Mouse and pointer event names with coordinates and button state. */
export type MouseInputType =
  "mousedown" | "click" | "dblclick" | "auxclick" | "contextmenu" | PointerInputType;

/** Viewport coordinates in CSS pixels for one pointer position. */
export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

/** Pointer data and cancellation capability for starting editable text selection. */
export interface EditableTextSelectionPointer {
  /** Horizontal viewport coordinate in CSS pixels. */
  readonly clientX: number;
  /** Vertical viewport coordinate in CSS pixels. */
  readonly clientY: number;
  /** Identity of the pointer initiating the selection. */
  readonly pointerId: number;
  /**
   * Cancels the initiating browser action while the input is being delivered.
   *
   * @returns The browser default action is prevented when cancellation is supported.
   */
  preventDefault(): void;
}

/**
 * Notifies the borrower after editable selection tracking has been released.
 *
 * @returns The borrower may release its own gesture resources.
 */
export type EditableTextSelectionEnd = () => void;

/** A cancellable edge-scroll session driven by pointer coordinates. */
export interface PointerAutoScroll {
  /**
   * Updates the held position and schedules edge scrolling when active.
   *
   * @param point - Current viewport coordinates in CSS pixels.
   * @param target - Optional uncaptured input target used to skip idle frames.
   * @returns The latest position is retained until stopped or the attachment becomes inactive.
   * @throws Propagates browser frame scheduling or lifecycle-check failures.
   */
  update(point: PointerPosition, target?: InputTarget): void;
  /**
   * Cancels pending frames and releases the held position.
   *
   * @returns No frame remains scheduled; repeated calls are harmless.
   */
  stop(): void;
}

/** Coordinates and selectors for an occurrence-local point hit. */
export interface RegionPointQuery {
  /** Horizontal client coordinate in CSS pixels. */
  readonly x: number;
  /** Vertical client coordinate in CSS pixels. */
  readonly y: number;
  /** Selector identifying the eligible owner region. */
  readonly ownerSelector: string;
  /** Selector identifying occurrence boundaries. */
  readonly boundarySelector: string;
}

/** The original hit and its projected owner within the receiving occurrence. */
export interface RegionPointHit {
  /** Original browser hit, captured within the receiving attachment. */
  readonly target: InputRegion;
  /** Owning region after projecting nested occurrences outward. */
  readonly owner: InputRegion;
}

/** CSS properties to set or remove on an input region. */
export type InputRegionStyles = Readonly<Record<string, string | null>>;

/** Optional behavior for observing a region's rendered size. */
export interface InputRegionSizeObservationOptions {
  /** Observe immediate element children present when observation begins. */
  readonly includeChildren?: boolean;
  /** Return a no-op disposer when the browser has no resize observer. */
  readonly allowUnavailable?: boolean;
}

/** A temporary style session on one captured input region. */
export interface InputRegionStyleSession {
  /**
   * Updates captured inline properties while the original attachment and ownership remain active.
   *
   * @param styles - CSS property names mapped to values, or null to remove a property.
   * @returns The supplied styles are applied while the session and region remain active.
   * @throws Propagates browser style mutation and ownership failures.
   */
  set(styles: InputRegionStyles): void;
  /**
   * Finishes this session with explicit final styles, even after detachment.
   *
   * A newer session for the same property takes ownership, so an older session
   * cannot overwrite it during cleanup. Repeated calls and later updates have no effect.
   *
   * @param styles - CSS properties to retain or remove on the captured region.
   * @returns The session is closed and its final styles have been applied.
   * @throws Propagates browser style mutation failures.
   */
  finish(styles: InputRegionStyles): void;
}

/** One temporary inline style declaration and its captured browser priority. */
export interface InputInlineStyleSession {
  /**
   * Updates the declaration while this region and style owner remain current.
   *
   * @param value - Temporary CSS value for the captured property.
   * @returns The preview value is applied when the session remains active.
   * @throws Propagates browser style and ownership failures.
   */
  set(value: string): void;
  /**
   * Ends this session and restores its original declaration or a replacement value.
   *
   * The captured inline priority is preserved. A newer style owner is never
   * overwritten, and cleanup can run after the occurrence detaches.
   *
   * @param value - Replacement value, or omitted to restore the captured value.
   * @returns This style owner is released; repeated calls are harmless.
   * @throws Propagates browser style restoration failures.
   */
  finish(value?: string): void;
}

/** Live indexed access to immediate child regions within one attachment. */
export interface InputRegionChildren {
  /**
   * Reads the current number of immediate element children.
   *
   * @returns The current count, or undefined when the parent is no longer owned.
   * @throws Propagates attachment-check failures.
   */
  getLength(): number | undefined;
  /**
   * Captures the current immediate child at an index without copying the list.
   *
   * @param index - Zero-based integer position in the live collection.
   * @returns The child region, or undefined when absent or ownership changes.
   * @throws Propagates attachment-check failures.
   */
  get(index: number): InputRegion | undefined;
}

/** A matching ancestor and its immediate parent, both bound to the captured path. */
export interface InputRegionAncestorWithParent {
  /** Nearest ancestor matching the requested selector. */
  readonly ancestor: InputRegion;
  /** Immediate parent of the matching ancestor. */
  readonly parent: InputRegion;
}

/** A captured input region whose operations are bounded by its attachment. */
export interface InputRegion {
  /**
   * Converts viewport coordinates into this SVG region's local coordinates.
   *
   * The current SVG transform is read for each call; rotation, scaling, and
   * translation are included. Detached and non-SVG regions cannot be converted.
   *
   * @param point - Viewport coordinates in CSS pixels.
   * @returns Local SVG coordinates, or undefined if the region or transform is unavailable.
   * @throws Propagates browser matrix and occurrence ownership failures.
   */
  clientToSvgPoint(point: PointerPosition): RegionPoint | undefined;
  /**
   * Captures the nearest matching ancestor and its immediate parent in this occurrence.
   *
   * Both regions become unavailable if the original target is disconnected,
   * the nearest match changes, or the captured ancestor is reparented.
   *
   * @param selector - CSS selector identifying the target or an ancestor.
   * @returns Captured regions, or undefined when either lies outside the occurrence or ownership ends.
   * @throws If the selector is invalid or an ownership check fails.
   */
  captureAncestorWithParent(selector: string): InputRegionAncestorWithParent | undefined;
  /**
   * Observes normalized input delivered to this region in a browser propagation phase.
   *
   * The browser preserves ordering with ancestor and descendant listeners. The
   * caller owns the returned subscription; delivery stops when this region leaves
   * its occurrence, even before the subscription is released. Return values do
   * not claim input; default prevention and propagation require explicit calls.
   *
   * @param type - Browser input name to observe.
   * @param phase - Capture or bubble phase on the region.
   * @param observer - Receives normalized input during its synchronous delivery.
   * @returns Idempotent disposer, or undefined if the region is no longer owned.
   * @throws Propagates browser listener setup, ownership, and cleanup failures.
   */
  observeInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: "capture" | "bubble",
    observer: (input: BrowserInputMap[K]) => void,
  ): (() => void) | undefined;
  /**
   * Captures live indexed access to immediate element children without copying them.
   *
   * @returns Child access bounded by this region, or undefined when ownership ends.
   * @throws Propagates attachment-check failures.
   */
  captureChildren(): InputRegionChildren | undefined;
  /**
   * Checks whether this region matches a selector while it remains owned.
   *
   * @param selector - CSS selector tested against this region.
   * @returns Whether the region matches, or undefined when ownership ends.
   * @throws If the selector is invalid or an ownership check fails.
   */
  matches(selector: string): boolean | undefined;
  /**
   * Visits this region and its ancestors through an inclusive containing boundary.
   *
   * The boundary must be captured within the same surface as this region.
   *
   * @param boundary - Active containing region; it is visited last when reached.
   * @param predicate - Synchronous test run from this region toward the boundary.
   * @returns True when the predicate matches, false when it does not or the boundary
   * does not contain this region or belongs to another surface, and undefined
   * if ownership changes during the walk.
   * @throws Propagates visitor and ownership-check failures.
   */
  someAncestorWithin(boundary: InputRegion, predicate: RegionPredicate): boolean | undefined;
  /**
   * Identifies this region without exposing its browser element.
   *
   * @returns Opaque element identity while this region remains owned, otherwise undefined.
   * @throws Propagates ownership-check failures.
   */
  getIdentity(): RegionIdentity | undefined;
  /**
   * Finds the first matching descendant while stopping at nested owner boundaries.
   *
   * @param selector - Selector for the desired region.
   * @param boundarySelector - Descendant boundaries that must not be traversed.
   * @returns The first owned region, or undefined when absent or detached.
   * @throws Propagates selector and ownership-check failures.
   */
  findOwnedRegion(selector: string, boundarySelector: string): InputRegion | undefined;
  /**
   * Captures matching descendants directly owned by the same occurrence.
   *
   * @param selector - Selector for descendant regions.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Regions in document order, or an empty list when detached.
   * @throws Propagates selector and ownership-check failures.
   */
  findRegions(selector: string, boundarySelector: string): readonly InputRegion[];
  /**
   * Measures the region in viewport CSS pixels while its attachment remains current.
   *
   * @returns Detached rectangle data, or undefined if the region is no longer owned.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readBounds(): RegionBounds | undefined;
  /**
   * Reads the region's untransformed layout width in CSS pixels.
   *
   * @returns The HTML layout width, or undefined when the region is inactive or not HTML.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readLayoutWidth(): number | undefined;
  /**
   * Reads the region's untransformed inner dimensions in CSS pixels.
   *
   * The dimensions include padding and exclude borders and scrollbars.
   *
   * @returns Detached dimensions, or undefined for an inactive or non-HTML region.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readClientSize(): RegionSize | undefined;
  /**
   * Reads one computed CSS property while the region remains owned.
   *
   * @param property - CSS property name to read.
   * @returns The computed value, including an empty value, or undefined when unavailable.
   * @throws Propagates browser style and ownership-check failures.
   */
  readComputedProperty(property: string): string | undefined;
  /**
   * Observes this region's viewport bounds during resize and ancestor scroll.
   *
   * An initial snapshot is delivered synchronously while the region is current.
   * Detachment and document movement stop delivery; cleanup remains available.
   *
   * @param observer - Receives each current bounds snapshot.
   * @returns Idempotent disposer for the captured observation.
   * @throws Propagates observation, measurement, and cleanup failures.
   */
  observeBounds(observer: RegionBoundsObserver): () => void;
  /**
   * Observes this region's document offset and follows the document end after resizing.
   *
   * The initial offset is delivered synchronously. Delivery and end following stop
   * when this region no longer belongs to its occurrence; the caller owns cleanup.
   *
   * @param observer - Receives the top offset in document CSS pixels.
   * @returns Idempotent disposer for resize, scroll, and pending frame work.
   * @throws Propagates observation, measurement, callback, and cleanup failures.
   */
  observeDocumentOffsetAndFollowEnd(observer: (offset: number) => void): () => void;
  /**
   * Observes size changes while this region belongs to its occurrence.
   *
   * @param observer - Called when the browser reports a change in region size.
   * @param options - Optional immediate-child observation and missing-browser fallback.
   * @returns Disposer releasing the observation; it remains safe after detachment.
   * @throws If size observation is unavailable without the fallback option, or browser setup or cleanup fails.
   */
  observeSize(observer: () => void, options?: InputRegionSizeObservationOptions): () => void;
  /**
   * Reads this region's scroll height while an enclosing region's height is unconstrained.
   *
   * The enclosing region's inline height and priority are restored after the read,
   * including if measurement fails. Both regions must belong to the same active
   * occurrence and the enclosing region must contain this region.
   *
   * @param container - Captured enclosing region whose height is temporarily set to auto.
   * @returns Scroll height in CSS pixels, or undefined if either region is unavailable or incompatible.
   * @throws Propagates ownership, browser style, or measurement failures.
   */
  readUnconstrainedScrollHeight(container: InputRegion): number | undefined;
  /**
   * Observes child insertion and removal throughout this region's subtree.
   *
   * @param observer - Called after the browser reports a structural change.
   * @returns Disposer releasing the observation; it remains safe after detachment.
   * @throws If structural observation is unavailable or setup or cleanup fails.
   */
  observeStructure(observer: () => void): () => void;
  /**
   * Focuses this region and places a collapsed caret near viewport coordinates.
   *
   * The operation belongs to this captured occurrence and ignores stale regions.
   * A browser fallback may still place the caret at the start when it returns false.
   *
   * @param clientX - Horizontal viewport coordinate in CSS pixels.
   * @param clientY - Vertical viewport coordinate in CSS pixels.
   * @returns True when the requested caret was placed; false when unavailable, stale, or using the fallback.
   * @throws Propagates focus, geometry, selection, and ownership failures.
   */
  placeCaretAtPoint(clientX: number, clientY: number): boolean;
  /**
   * Begins a pointer-driven text selection inside this editable region.
   *
   * A valid initial caret hit prevents the input default, focuses the host, and
   * tracks that pointer in the captured window. No native objects escape Root.
   * The completion callback runs once on release, cancellation, or cleanup.
   *
   * @param input - Pointer coordinates, identity, and synchronous default cancellation.
   * @param onEnd - Releases the caller's gesture-local resources when tracking ends.
   * @returns Idempotent cancellation, or undefined when no editable hit is accepted.
   * @throws Propagates hit testing, focus, selection, listener, and cleanup failures.
   */
  beginEditableTextSelection(
    input: EditableTextSelectionPointer,
    onEnd: EditableTextSelectionEnd,
  ): (() => void) | undefined;
  /**
   * Measures bounds, scale, direction, and selected computed CSS properties.
   *
   * @param properties - CSS property names to copy into the result.
   * @returns Detached layout data, or undefined when ownership ends or the region is not an HTML element.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readLayout(properties: readonly string[]): RegionLayout | undefined;
  /**
   * Captures inline style properties without exposing the browser element.
   *
   * A newer session for the same property replaces the previous session's ownership.
   *
   * @param properties - CSS property names this session may update or finish.
   * @returns A style session, or undefined when the region is inactive or has no inline styles.
   * @throws Propagates ownership checks.
   */
  captureStyles(properties: readonly string[]): InputRegionStyleSession | undefined;
  /**
   * Captures one inline declaration for temporary changes and exact restoration.
   *
   * @param property - CSS property name whose value and priority are captured.
   * @returns A style session, or undefined when the region cannot be styled.
   * @throws Propagates browser style reads and ownership checks.
   */
  captureInlineStyle(property: string): InputInlineStyleSession | undefined;
  /**
   * Reads one inline CSS declaration from this captured region.
   *
   * @param property - CSS property name to read, such as `transform`.
   * @returns The current inline value, including an empty string when unset, or undefined when the region is unavailable or cannot be styled.
   * @throws Propagates browser style and ownership-check failures.
   */
  readInlineStyle(property: string): string | undefined;
  /**
   * Reads an attribute while this region still belongs to its attachment.
   *
   * If reading synchronously ends region ownership, the value is discarded.
   *
   * @param name - Attribute to read from the captured region.
   * @returns Current value, or undefined if absent or no longer owned.
   * @throws If the browser rejects the attribute name or region ownership checks fail.
   */
  readAttribute(name: string): string | undefined;
  /**
   * Compares the captured region with another region from the same occurrence.
   *
   * @param other - Region to compare.
   * @returns Whether both active regions identify the same browser target.
   */
  isSame(other: InputRegion): boolean;
  /**
   * Checks whether another active region is contained in this active region.
   *
   * @param other - Captured region to test, possibly from a nested attachment.
   * @returns False when either region is inactive, unknown, or outside this region.
   */
  containsRegion(other: InputRegion): boolean;
  /**
   * Compares the documents of two active regions without exposing either document.
   *
   * @param other - Region to compare, possibly from another attachment.
   * @returns False when either region is inactive, unknown, or belongs to a different document.
   */
  isInSameDocument(other: InputRegion): boolean;
  /**
   * Reads an attribute from the target's nearest matching ancestor inside this region.
   *
   * Non-element targets, inactive regions and matching ancestors outside the
   * region return undefined. The ancestor is resolved when this method is called.
   * If region ownership or the target's matching ancestry changes during the
   * read, its value is discarded.
   *
   * @param target - Target from normalized input, or null when unavailable.
   * @param selector - Selector identifying the nearest eligible ancestor.
   * @param name - Attribute to read from that ancestor.
   * @returns Attribute value, or undefined when the target, match or attribute is unavailable.
   * @throws If the browser rejects an evaluated selector.
   */
  ancestorAttribute(target: InputTarget | null, selector: string, name: string): string | undefined;
  /**
   * Checks whether an input target is contained by this region.
   *
   * @param target - Target from a normalized input, or null when unavailable.
   * @returns False for a detached region, an unknown target, or a target outside it.
   */
  containsTarget(target: InputTarget | null): boolean;
  /**
   * Enables or removes an attribute on this region while its attachment is active.
   *
   * @param name - Attribute used by the consumer's presentation.
   * @param enabled - Whether the attribute should be present.
   * @returns The attribute is updated when the region is still owned by the attachment.
   * @throws If the browser rejects the attribute name.
   */
  toggleAttribute(name: string, enabled: boolean): void;
  /**
   * Temporarily replaces one presentation attribute on this active region.
   *
   * Cleanup restores the preceding active owner or original value even if the
   * region is later detached. Releasing an older owner leaves newer values intact.
   * An inactive region returns a no-op disposer without changing the element.
   *
   * @param name - Attribute to replace.
   * @param value - Value to apply while the caller owns the marker.
   * @returns Idempotent disposer restoring the remaining owner or original value.
   * @throws If setting or restoring the attribute fails; AggregateError retains a failed rollback.
   */
  setTemporaryAttribute(name: string, value: string): () => void;
}

/**
 * Tests one attachment-bound region during a synchronous ancestor walk.
 *
 * @param region - Current region, starting at the hit and moving toward the boundary.
 * @returns True to stop the walk with a match, or false to continue.
 */
export type RegionPredicate = (region: InputRegion) => boolean;

/** Browser region that can request focus while its attachment remains current. */
export interface FocusableInputRegion extends InputRegion {
  /**
   * Requests focus on this region without scrolling it into view.
   *
   * A region that no longer belongs to its captured attachment is ignored.
   * Non-HTML regions cannot receive this focus request.
   *
   * @returns Focus has been requested when the region is active and is an HTML element.
   * @throws Propagates ownership checks and browser focus failures.
   */
  focus(): void;
}

/** Normalized mouse input in CSS pixels with modifier and button state. */
export interface MouseInput<Type extends MouseInputType = MouseInputType>
  extends InputEvent, KeyboardModifiers {
  /** Mouse or pointer event name for this input. */
  readonly type: Type;
  /** Horizontal client coordinate in CSS pixels. */
  readonly clientX: number;
  /** Vertical client coordinate in CSS pixels. */
  readonly clientY: number;
  /** Button associated with this input, using browser button numbering. */
  readonly button: number;
  /** Bit mask of buttons currently pressed. */
  readonly buttons: number;
  /** Browser-reported click count, or zero when unavailable; keyboard clicks generally report zero. */
  readonly detail: number;
}

/** Normalized pointer input for a specific contact. */
export interface PointerInput<
  Type extends PointerInputType = PointerInputType,
> extends MouseInput<Type> {
  /** Pointer phase emitted by the browser adapter. */
  readonly type: Type;
  /** Identity of the active pointer contact. */
  readonly pointerId: number;
  /** Browser-reported pointer kind, such as mouse, pen or touch. */
  readonly pointerType: string;
  /** Whether this is the primary pointer of its kind. */
  readonly isPrimary: boolean;
  /**
   * Captures this pointer on the attached input root.
   *
   * Use during a live pointer delivery. The returned disposer can release the
   * capture after detachment and cannot release a newer capture acquired through
   * this capability for the same root and pointer.
   *
   * @returns Idempotent capture release, or undefined after listener detachment.
   * @throws If the browser rejects pointer capture.
   */
  captureRootPointer(): (() => void) | undefined;
  /**
   * Captures this pointer on the nearest matching target within the input root.
   *
   * Use during a live pointer delivery. The release can run after detachment and
   * cannot release a newer capture acquired through Root for the same target and pointer.
   *
   * @param selector - Selector identifying the target or an ancestor within this root.
   * @returns Idempotent release, or undefined when detached or no owned target matches.
   * @throws If the selector is invalid or browser pointer capture fails.
   */
  captureTargetPointer(selector: string): (() => void) | undefined;
  /**
   * Checks whether the native target is an element in the current JavaScript realm.
   *
   * @returns False for non-elements and elements from another realm.
   */
  isCurrentRealmElement(): boolean;
  /**
   * Focuses the nearest matching target ancestor without scrolling.
   *
   * After listener detachment this operation does nothing.
   *
   * @param selector - Selector identifying the focus target.
   * @returns Focus has been requested if the active input has a matching HTML or SVG ancestor within the Root.
   * @throws If the selector or browser focus operation fails.
   */
  focusTargetAncestor(selector: string): void;
  /**
   * Creates a scrolling session bound to this pointer's listener and occurrence.
   *
   * Both attachment checks run before each frame, including after remount.
   *
   * @param afterScroll - Refreshes gesture geometry after a scroll movement.
   * @param isActive - Checks the separately borrowed occurrence's current lifetime.
   * @returns Independent session stopped by its gesture owner.
   */
  createAutoScroll(afterScroll: () => void, isActive: () => boolean): PointerAutoScroll;
  /**
   * Schedules work for the next task of this pointer's listener attachment.
   *
   * The callback is skipped after that attachment is released. Consumers with
   * a separately borrowed occurrence must also check its lifetime in the callback.
   *
   * @param callback - Work to run while this listener attachment remains active.
   * @returns Idempotent disposer cancelling the task, or a no-op without a browser window.
   * @throws Propagates browser scheduling failures.
   */
  scheduleTask(callback: () => void): () => void;
  /** Related pointer target, or null when the transition has no element target. */
  readonly relatedTarget: InputTarget | null;
  /**
   * Captures the nearest region belonging to the target's nearest owner.
   *
   * The returned capability remains valid only for this attachment and while
   * the region stays inside its root. It does not expose the browser element.
   *
   * @param selector - Selector identifying the region.
   * @param ownerSelector - Selector identifying the region's containing owner.
   * @param boundarySelector - Selector identifying nested occurrence boundaries.
   * @returns Captured region, or undefined if either match is missing or outside the root.
   * @throws If the browser rejects a selector.
   */
  captureRegion(
    selector: string,
    ownerSelector: string,
    boundarySelector: string,
  ): InputRegion | undefined;
  /**
   * Reads whether propagation has already been stopped for this delivery.
   *
   * The result is live during synchronous dispatch, including changes made by
   * earlier browser listeners on the same target.
   *
   * @returns Whether native propagation has been stopped.
   */
  isPropagationStopped(): boolean;
}

/** Normalized wheel input in browser-reported units. */
export interface WheelInput extends InputEvent, KeyboardModifiers {
  /** Discriminates wheel input from pointer input. */
  readonly type: "wheel";
  /** Horizontal client coordinate in CSS pixels. */
  readonly clientX: number;
  /** Vertical client coordinate in CSS pixels. */
  readonly clientY: number;
  /** Horizontal delta in the units identified by `deltaMode`. */
  readonly deltaX: number;
  /** Vertical delta in the units identified by `deltaMode`. */
  readonly deltaY: number;
  /** Browser wheel delta unit: pixels, lines or pages. */
  readonly deltaMode: number;
}

/** Normalized keyboard input without a native keyboard event. */
export interface KeyInput<Type extends "keydown" | "keyup" = "keydown" | "keyup">
  extends InputEvent, KeyboardKeyInput {
  /** Whether the browser default had already been prevented when this input was delivered. */
  readonly defaultPrevented: boolean;
  /** Live keyboard target queries supplied by the browser adapter, when available. */
  readonly keyboardTarget?: KeyboardTarget;
  /** Keyboard phase for this input. */
  readonly type: Type;
  /** Whether the input is an automatically repeated key press. */
  readonly repeat: boolean;
}

/** Browser editing data copied independently of the original event. */
export interface TextInputData {
  /** Browser edit operation, or an empty string when unavailable. */
  readonly inputType: string;
  /** Inserted text, or null when the browser does not supply it. */
  readonly data: string | null;
  /** Whether this input belongs to an active composition. */
  readonly isComposing: boolean;
}

/** Text input data captured before or after a browser edit. */
export interface TextInput<Type extends "beforeinput" | "input" = "beforeinput" | "input">
  extends InputEvent, TextInputData {
  /** Whether the browser is reporting the impending or completed edit. */
  readonly type: Type;
  /**
   * Captures a matching target ancestor as a browser-free content host.
   *
   * Browser input provides this capability; other providers may omit it. Capture
   * is unavailable after its originating attachment guard rejects it. The
   * caller must check its occurrence registration before deferred operations on
   * an already captured host. When a boundary selector is supplied, ownership
   * reads also reject a host moved into another nested occurrence.
   *
   * @param selector - Selector identifying the content host.
   * @param boundarySelector - Optional selector identifying nested occurrences.
   * @returns Captured host, or undefined when detached, moved, or no matching host belongs to the root.
   * @throws If the browser rejects the selector or attachment check fails.
   */
  captureTextHost?(selector: string, boundarySelector?: string): TextHost | undefined;
  /**
   * Captures the text of a matching target ancestor without exposing its element.
   *
   * The target is fixed for this input delivery, including if the browser event
   * is dispatched again. The ancestor is selected once inside the receiving root.
   * The returned reader reads that same host's current text, including after the
   * host is detached.
   *
   * @param selector - Selector identifying the text host.
   * @returns Live text reader, or undefined if the target or owned host is absent.
   * @throws If the browser rejects the selector.
   */
  captureTargetText(selector: string): (() => string) | undefined;
}

/** Clipboard format values and the subset supported by asynchronous writing. */
export interface ClipboardWriteFormats {
  /** MIME names and their string content for the synchronous fallback. */
  readonly formats: Readonly<Record<string, string>>;
  /** MIME names to include in an asynchronous ClipboardItem. */
  readonly asynchronousFormats: readonly string[];
}

/** Synchronous access to clipboard formats during the current delivery. */
export interface ClipboardData {
  /**
   * Reads a clipboard format supplied by the browser for this event.
   *
   * @param format - Clipboard format such as `text/plain` or `text/html`.
   * @returns The format's text, or an empty string when it is unavailable.
   * @throws Propagates browser clipboard access failures.
   */
  read(format: string): string;
  /**
   * Sets a clipboard format during this event's synchronous delivery.
   *
   * @param format - Clipboard format to set.
   * @param value - Text representation of that format.
   * @returns The browser has received the request to write that format.
   * @throws Propagates browser clipboard access failures.
   */
  write(format: string, value: string): void;
}

/** Live clipboard queries for the target captured during one delivery and its focused host. */
export interface ClipboardTarget {
  /**
   * Checks whether a marked text control or non-block editable host owns input.
   *
   * Checks the captured event target and the focused element in its document because a
   * browser may dispatch clipboard input to the document body instead of focus.
   * Target ancestry and document focus are read live; later redispatch of the
   * same native event does not replace the captured target.
   *
   * @param controlSelector - Selector marking controls with native text editing.
   * @param blockContentSelector - Selector marking structured block text hosts.
   * @returns True when clipboard input belongs to independent native text editing.
   * @throws If a supplied selector is rejected by the browser.
   */
  isIndependentTextEditing(controlSelector: string, blockContentSelector: string): boolean;
}

/** Clipboard input and access to formats when the browser supplies them. */
export interface ClipboardInput<
  Type extends "copy" | "cut" | "paste" = "copy" | "cut" | "paste",
> extends InputEvent {
  /** Clipboard operation associated with this delivery. */
  readonly type: Type;
  /** Synchronous format access, or null if the browser supplies no clipboard data. */
  readonly clipboard: ClipboardData | null;
  /** Live target and focused-host queries for this delivery. */
  readonly clipboardTarget: ClipboardTarget;
}

/** Initial touch notification without browser-specific touch objects. */
export interface TouchStartInput extends InputEvent {
  /** Browser input name for the initial touch contact. */
  readonly type: "touchstart";
}

/** Visibility state captured from the document owning the attached occurrence. */
export interface DocumentVisibilityInput extends InputEvent {
  /** Browser document-visibility notification. */
  readonly type: "visibilitychange";
  /** Whether the occurrence's owning document is hidden at this delivery. */
  readonly hidden: boolean;
}

/** Selection-change notification with the selection anchor's target capability. */
export interface SelectionChangeInput extends InputEvent {
  /** Browser selection-change notification. */
  readonly type: "selectionchange";
  /** Anchor ancestry, or event target ancestry when no anchor exists; null when unavailable. */
  readonly selectionTarget: InputTarget | null;
}

/** Browser inputs currently consumed by the mounted editor surfaces. */
export interface BrowserInputMap {
  readonly pointerenter: PointerInput<"pointerenter">;
  readonly pointerleave: PointerInput<"pointerleave">;
  readonly pointerdown: PointerInput<"pointerdown">;
  readonly pointermove: PointerInput<"pointermove">;
  readonly pointerup: PointerInput<"pointerup">;
  readonly pointercancel: PointerInput<"pointercancel">;
  readonly lostpointercapture: PointerInput<"lostpointercapture">;
  readonly pointerover: PointerInput<"pointerover">;
  readonly pointerout: PointerInput<"pointerout">;
  readonly touchstart: TouchStartInput;
  readonly wheel: WheelInput;
  readonly keydown: KeyInput<"keydown">;
  readonly keyup: KeyInput<"keyup">;
  readonly mousedown: MouseInput<"mousedown">;
  readonly contextmenu: MouseInput<"contextmenu">;
  readonly auxclick: MouseInput<"auxclick">;
  readonly click: MouseInput<"click">;
  readonly dblclick: MouseInput<"dblclick">;
  readonly beforeinput: TextInput<"beforeinput">;
  readonly input: TextInput<"input">;
  readonly copy: ClipboardInput<"copy">;
  readonly cut: ClipboardInput<"cut">;
  readonly paste: ClipboardInput<"paste">;
  readonly focusin: FocusInput<"focusin">;
  readonly focusout: FocusInput<"focusout">;
  readonly blur: InputEvent;
  readonly scroll: InputEvent;
  readonly resize: InputEvent;
  readonly selectionchange: SelectionChangeInput;
  readonly visibilitychange: DocumentVisibilityInput;
}

/** Propagation phase used for a captured-window input observation. */
export type WindowInputPhase = "capture" | "bubble";

/** Browser listener placement relative to an attached occurrence. */
export type BrowserInputTarget = "root" | "document" | "window";

/** Browser input name and listener placement retained across attachments. */
export interface BrowserInputDefinition<K extends keyof BrowserInputMap> {
  readonly type: K;
  readonly target: BrowserInputTarget;
  readonly capture: boolean;
  /** Whether browser default prevention is disabled for this listener; defaults to false. */
  readonly passive?: boolean;
  /** Whether a root listener also receives events from nested occurrences; defaults to false. */
  readonly includeNested?: boolean;
}

/** Input observation options for a borrowed Root, including nested root input. */
export type InputObserverDefinition<K extends keyof BrowserInputMap> = Omit<
  BrowserInputDefinition<K>,
  "includeNested"
>;

/** Caller-owned normalized input subscriptions sharing dispatch identity. */
export interface InputObserver {
  /**
   * Observes one input group until its disposer or the observer is released.
   *
   * Root-targeted observations include nested occurrence input; consumers apply
   * their own scope rules to the normalized target.
   *
   * @param definition - Input name, target, phase and passive option.
   * @param deliver - Receives normalized input and an identity shared by this dispatch's groups, when available.
   * @returns Idempotent disposer releasing this registration.
   * @throws If disposed or listener setup and rollback fail.
   */
  observe<K extends keyof BrowserInputMap>(
    definition: InputObserverDefinition<K>,
    deliver: (input: BrowserInputMap[K], dispatchIdentity?: object) => void,
  ): () => void;
  /**
   * Releases all retained registrations and the underlying attachment.
   *
   * @returns All registrations and the attachment have been offered cleanup.
   * @throws Cleanup failures, aggregated when more than one release fails.
   */
  dispose(): void;
}

/** Handler decision for one synchronous event dispatch. */
export type EventResult = "handled" | "continue";

/** Identifies and orders one event registration. */
export interface EventRegistration<Key extends PropertyKey> {
  /** Nonblank identity unique within the dispatcher. */
  readonly id: string;
  /** Event name from the dispatcher's event map. */
  readonly type: Key;
  /** Higher values run first; equal priorities retain registration order. */
  readonly priority?: number;
}

/** Retained type-erased callback for one exact event name. */
export interface EventEntry {
  readonly priority: number;
  readonly observer: boolean;
  active: boolean;
  /**
   * Delivers a payload belonging to this entry's exact event name.
   *
   * @param payload - Payload supplied to dispatch for the registered name.
   * @returns Whether a handler claims the event; observer results are ignored.
   */
  invoke(payload: unknown): EventResult | void;
}

/** Captured registrations that can be delivered across several event phases. */
export interface EventDelivery<Events extends object> {
  /**
   * Runs captured observers for one event name regardless of prior claims.
   *
   * @param type - Event name from the dispatcher's event map.
   * @param payload - Payload associated with that event name.
   * @returns Eligible active observers have run.
   * @throws Propagates observer failures.
   */
  observe<Key extends keyof Events>(type: Key, payload: Events[Key]): void;

  /**
   * Runs captured handlers until one claims this phase's event.
   *
   * @param type - Event name from the dispatcher's event map.
   * @param payload - Payload associated with that event name.
   * @returns `handled` when a handler claims the event, otherwise `continue`.
   * @throws Propagates handler failures.
   */
  dispatch<Key extends keyof Events>(type: Key, payload: Events[Key]): EventResult;
}

/** Native listener placement; global listeners belong to the attached root's realm. */
export type BrowserEventTarget = BrowserInputTarget;

/** Input identity and browser listener options retained across occurrence remounts. */
export interface BrowserEventDefinition<K extends keyof BrowserInputMap> {
  /** Stable identity unique among this occurrence's input registrations. */
  readonly id: string;
  /** Input name selecting the normalized handler payload. */
  readonly type: K;
  /** Native listener realm; defaults to the occurrence root. */
  readonly target?: BrowserEventTarget;
  /** Whether the browser listener receives input during capture. */
  readonly capture?: boolean;
  /** Whether default prevention is disabled for this listener; defaults to false. */
  readonly passive?: boolean;
  /** Higher priorities run first within the same native target, phase and passive group; defaults to zero. */
  readonly priority?: number;
}

/** Browser observation that may include events from nested occurrences. */
export interface BrowserEventObservation<
  K extends keyof BrowserInputMap,
> extends BrowserEventDefinition<K> {
  /** Include nested occurrences for root observations; global observations remain unfiltered.
   * Observations with different values use separate native listener groups. */
  readonly includeNested?: boolean;
}

/** Typed registration retained across occurrence detach and remount. */
export interface BrowserEventRegistration<
  K extends keyof BrowserInputMap,
> extends BrowserEventDefinition<K> {
  /**
   * Receives normalized input for the attached occurrence.
   *
   * Default prevention and native propagation remain explicit callback operations.
   * Return handled to skip later registered handlers in this native listener group.
   *
   * @param event - Typed input data and synchronous browser capabilities.
   * @returns Handled when subsequent handlers in the group must not run.
   */
  readonly handle: (event: BrowserInputMap[K]) => "handled" | void;
}

/** Identity and priority of a custom event owned by an occurrence. */
export interface CustomEventDefinition<Key extends string> extends EventRegistration<Key> {
  /** Distinguishes custom events from browser input registrations. */
  readonly kind: "custom";
}

/** Typed callback for an occurrence's custom event. */
export interface CustomEventRegistration<
  Events extends object,
  Key extends Extract<keyof Events, string>,
> extends CustomEventDefinition<Key> {
  /**
   * Receives the payload supplied by the event producer.
   *
   * @param event - Payload associated with this custom event name.
   * @returns Handled to stop later handlers, or void to continue delivery.
   */
  readonly handle: (event: Events[Key]) => "handled" | void;
}

/** Type-erased browser and custom payloads indexed by internal group identity. */
export interface BrowserEventPayloads {
  readonly [group: string]: unknown;
}

/** Registrations sharing a single native listener and dispatch order. */
export interface BrowserEventGroup {
  readonly type: keyof BrowserInputMap;
  readonly target: BrowserEventTarget;
  readonly capture: boolean;
  readonly passive: boolean;
  readonly includeNested?: boolean;
  release?: () => void;
}

/** Native event group and attachment realm used by multi-occurrence listeners. */
export interface BrowserListenerGroup {
  readonly target: "surface" | "document" | "window";
  readonly type: string;
  readonly capture: boolean;
  readonly passive: boolean;
}

/** Attachment check borrowed by normalized multi-occurrence delivery. */
export type BrowserListenerRoot = Pick<InputRoot, "isAttached">;

/**
 * Delivers an event from a retained native listener group.
 *
 * @param group - Native listener's event name, realm, and options.
 * @param rootIdentity - Opaque surface element identity; absent for document and window delivery.
 * @param capture - Normalizes this delivery after the consumer chooses its receiving occurrence.
 * @param identity - Opaque dispatch identity when tracking is enabled; otherwise unique to this callback.
 * @param control - Synchronous browser-default status and cancellation capabilities.
 * @returns The consumer has processed this native delivery.
 */
export type BrowserListenerDispatch = (
  group: BrowserListenerGroup,
  rootIdentity: object | undefined,
  capture: BrowserListenerCapture,
  identity: object,
  control: BrowserListenerControl,
) => void;

/** Browser-default operations for one synchronous input delivery. */
export interface BrowserListenerControl {
  /**
   * Reads the originating occurrence for this pointer continuation.
   *
   * The owner is captured for this browser delivery so other listener owners see
   * it even after a pointer release clears the document's active owner.
   *
   * @returns Opaque occurrence element identity, or undefined when no pointer is owned.
   */
  getPointerOwner(): object | undefined;
  /**
   * Assigns the document's current pointer gesture to an occurrence.
   *
   * @param owner - Opaque element identity of the originating occurrence.
   * @returns Later pointer continuations can resolve that owner.
   */
  claimPointerOwner(owner: object): void;
  /**
   * Clears the gesture captured by this delivery after a release or cancellation.
   *
   * A gesture started after this delivery captures its owner remains active,
   * even on the same root. If no owner was read yet, this captures it first.
   *
   * @returns The captured gesture is cleared if it is still active.
   */
  releasePointerOwner(): void;
  /**
   * Reads whether a previous listener prevented this delivery's browser default.
   *
   * @returns Current browser default-prevention state.
   */
  isDefaultPrevented(): boolean;
  /**
   * Requests browser-default cancellation when this delivery is cancelable.
   *
   * @returns The cancellation request has been made when supported.
   */
  preventDefault(): void;
}

/**
 * Captures normalized input for the occurrence selected by host routing.
 *
 * Use synchronously during the listener callback; the selected occurrence owns
 * the attachment check used by retained browser capabilities.
 *
 * @param root - Receiving occurrence selected for this native delivery.
 * @returns Normalized input and occurrence-bound browser capabilities, or undefined
 * when the occurrence is detached or is not a Root-owned browser occurrence.
 * @throws Propagates occurrence ownership checks and browser input capture failures.
 */
export type BrowserListenerCapture = (
  root: BrowserListenerRoot,
) => BrowserInputMap[keyof BrowserInputMap] | undefined;

/** One routed browser registration and its default-prevention policy. */
export interface BrowserRoutedEventDefinition extends BrowserListenerGroup {
  /** Unique registration identity within the routed event owner. */
  readonly id: string;
  /** Whether a handled registration requests cancellation of the browser default. */
  readonly preventDefault: boolean;
}

/**
 * Resolves host context for one normalized browser listener delivery.
 *
 * @param group - Listener realm, event name, and browser listener options.
 * @param rootIdentity - Opaque surface identity, absent for document and window listeners.
 * @param capture - Synchronous normalized input capture for the chosen occurrence.
 * @param identity - Opaque identity shared by phases of this browser dispatch.
 * @param control - Pointer ownership operations for this delivery.
 * @returns Host context, or undefined when this delivery has no eligible recipient.
 * @throws Propagates host routing and input capture failures.
 */
export type BrowserRoutedEventFactory<EventValue> = (
  group: BrowserListenerGroup,
  rootIdentity: object | undefined,
  capture: BrowserListenerCapture,
  identity: object,
  control: Pick<
    BrowserListenerControl,
    "getPointerOwner" | "claimPointerOwner" | "releasePointerOwner"
  >,
) => EventValue | undefined;
