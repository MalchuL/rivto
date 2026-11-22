import type {
  InputHit,
  InputRegion,
  InputRoot,
  PointerAutoScroll,
  PointerInput,
  RegionIdentity,
} from "@chulane/rivto-root";
import type { BlockDragBrowser } from "./browser/block-drag-browser";
import type { BlockDragSourceFeedback } from "./block-drag-source-feedback";

/** Pointer state survives source unmount; DOM feedback never renders block subtrees. */
export interface BlockDragGesture {
  readonly browser: BlockDragBrowser;
  readonly inputRoot: Pick<InputRoot, "isAttached" | "isConnected" | "isInSameDocument" | "focus">;
  readonly createAutoScroll: PointerInput["createAutoScroll"];
  readonly pointerId: number;
  readonly activeId: string;
  readonly startX: number;
  readonly startY: number;
  x: number;
  y: number;
  ids?: readonly string[];
  selected?: ReadonlySet<string>;
  readonly sourceFeedback: BlockDragSourceFeedback;
  stopTargetDetach?: () => void;
  target?: ResolvedBlockDropTarget;
  readonly releasePointer: () => void;
  autoScroll?: PointerAutoScroll;
}

/** Root operations required to register a receiving drop surface. */
export type BlockDropSurfaceRoot = Pick<
  InputRoot,
  "getElementIdentity" | "isAttached" | "isConnected" | "setTemporaryAttribute"
>;

/** One receiver registration and its exact borrowed Root. */
export interface BlockDropSurfaceEntry<T extends object> {
  readonly controller: T;
  readonly root: BlockDropSurfaceRoot;
  readonly identity: RegionIdentity;
}

/**
 * Opaque browser hit shared synchronously while resolving one drag position.
 *
 * The originating delivery or router releases it after resolution; retaining it
 * cannot preserve a browser target for a later input or attachment.
 */
export type BlockDragHit = InputHit;

/** Attachment identity and live status borrowed by browser drop geometry. */
export interface BlockDropAttachment {
  readonly inputRoot: Pick<
    InputRoot,
    "isAttached" | "getElementIdentity" | "captureDocument" | "captureRegionByIdentity"
  >;
}

/** Detached read-only preview text supplied by the host, without editable renderers or subtrees. */
export interface BlockDragPreviewRow {
  readonly text: string;
  /** Relative outline depth within a captured root; zero denotes that root. */
  readonly depth: number;
}

/** Pointer data needed to finish a drag or revalidate its last displayed target. */
export type BlockDragReleaseInput = Pick<
  PointerInput<"pointerup" | "pointermove">,
  "type" | "pointerId" | "clientX" | "clientY"
>;

/** Candidate appending children to an existing real block or document root. Permission is checked on future commit. */
export interface InsideBlockDropDestination {
  readonly kind: "inside";
  readonly parentId: string | null;
}

/** Canonical gap in actual ordered children; null parent denotes document roots. */
export interface BetweenBlockDropDestination {
  readonly kind: "between";
  readonly parentId: string | null;
  readonly previousId: string | null;
  readonly nextId: string | null;
}

/** Geometry-selected destination, not authorization to mutate the document. */
export type BlockDropDestination = InsideBlockDropDestination | BetweenBlockDropDestination;

/**
 * Checks a candidate against the current source group without mutating document state.
 *
 * @param destination - Canonical proposed insertion with moving roots excluded.
 * @returns Whether the selected declared destination is allowed for the current source.
 */
export type BlockDropAcceptance = (destination: BlockDropDestination) => boolean;

/** Pointer coordinates in viewport CSS pixels. */
export interface BlockDropPoint {
  readonly x: number;
  readonly y: number;
}

/** Viewport bounds used without constructing browser-only rectangle objects. */
export interface BlockDropBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** Detached geometry and computed layout values shared by declarations on one anchor. */
export interface BlockDropGeometry {
  readonly rect: BlockDropBounds;
  /** Owned content or primary row, when mounted and nonempty; never a descendant block. */
  readonly contentRect?: BlockDropBounds;
  /** False for an owned local child layout; omission preserves ordinary outline depth. */
  readonly continuesOutline?: boolean;
  readonly direction: string;
  readonly targetSize: string;
  readonly indent: string;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Read-only Root operations used while resolving a registered drop ancestor. */
export type BlockDropAncestor = Pick<
  InputRegion,
  "getIdentity" | "readAttribute" | "matches" | "containsRegion"
>;

/**
 * Tests one ancestor while locating registered drop geometry.
 *
 * @param region - Current ancestor's identity and attributes.
 * @returns True to stop the walk, or false to continue toward the root.
 */
export type BlockDropAncestorPredicate = (region: BlockDropAncestor) => boolean;

/** Query-local access to geometry for mounted drop registrations. */
export interface BlockDropGeometryReader {
  /**
   * Checks whether one registered region contains another in the current attachment.
   *
   * @param parent - Opaque identity of the candidate containing region.
   * @param child - Opaque identity of the candidate contained region.
   * @returns True while the parent contains the child.
   * @throws When a region or the attachment becomes unavailable.
   */
  contains(parent: RegionIdentity, child: RegionIdentity): boolean;
  /**
   * Reads an attribute from the nearest matching ancestor inside the Page root.
   *
   * @param regionIdentity - Opaque identity of the starting region, included in the search.
   * @param selector - Selector identifying the ancestor.
   * @param name - Attribute read from the first matching ancestor.
   * @returns Its value, or undefined when the ancestor or attribute is absent.
   * @throws When the path changes, the attachment ends, or the selector is invalid.
   */
  readAncestorAttribute(
    regionIdentity: RegionIdentity,
    selector: string,
    name: string,
  ): string | undefined;
  /**
   * Checks whether a region contains a registered region in the current attachment.
   *
   * @param region - Candidate containing region.
   * @param identity - Opaque identity of the registered region.
   * @returns True when the registered region remains inside the candidate.
   * @throws When either region or the attachment becomes unavailable.
   */
  containsIdentity(
    region: Pick<BlockDropAncestor, "getIdentity" | "containsRegion">,
    identity: RegionIdentity,
  ): boolean;
  /**
   * Reads an attribute from an anchor in the current Page attachment.
   *
   * @param regionIdentity - Opaque identity of the registered anchor within the current Page.
   * @param name - Attribute to read from the anchor.
   * @returns The current attribute value, or undefined when absent.
   * @throws When the anchor or attachment is unavailable, or the browser read fails.
   */
  readAttribute(regionIdentity: RegionIdentity, name: string): string | undefined;
  /**
   * Checks whether a registered anchor's child host continues outline depth.
   *
   * Missing child hosts retain ordinary outline behavior.
   *
   * @param regionIdentity - Opaque identity of the registered anchor within the current Page.
   * @returns False only for a child host declaring local scope.
   * @throws When the attachment or registered child host becomes unavailable.
   */
  continuesOutline(regionIdentity: RegionIdentity): boolean;
  /**
   * Visits the current hit and its ancestors through the Page root.
   *
   * @param predicate - Synchronous test run from the hit toward the root, inclusive.
   * @returns True if the predicate stopped the walk, otherwise false.
   * @throws When the attachment or ancestor path changes, or the predicate fails.
   */
  walkHitAncestors(predicate: BlockDropAncestorPredicate): boolean;
  /**
   * Visits a registered region and its ancestors through the Page root.
   *
   * @param regionIdentity - Opaque identity of the registered region inside the current Page.
   * @param predicate - Synchronous test run from the region toward the root, inclusive.
   * @returns True if the predicate stopped the walk, otherwise false.
   * @throws When the attachment or ancestor path changes, or the predicate fails.
   */
  walkAncestors(regionIdentity: RegionIdentity, predicate: BlockDropAncestorPredicate): boolean;
  /**
   * Checks whether a registered region contains this query's hit.
   *
   * @param regionIdentity - Opaque identity of the region within the attached Page.
   * @returns True while the current hit belongs to the region.
   * @throws When a region becomes unavailable or ownership checks fail.
   */
  containsHit(regionIdentity: RegionIdentity): boolean;
  /**
   * Measures a region in viewport coordinates.
   *
   * @param regionIdentity - Opaque identity of the mounted region inside the attached Page.
   * @returns Detached bounds for the current query.
   * @throws When a measurement is unavailable or browser and ownership checks fail.
   */
  readBounds(regionIdentity: RegionIdentity): BlockDropBounds;
  /**
   * Checks whether the current hit is unoccupied background within a host.
   *
   * @param host - Opaque identity of the registered background owner.
   * @param point - Exact viewport position in CSS pixels.
   * @returns True when the hit is inside the host and outside occupied regions and exclusions.
   * @throws When a region becomes unavailable or browser and ownership checks fail.
   */
  isBackground(host: RegionIdentity, point: BlockDropPoint): boolean;
  /**
   * Measures one anchor for the current resolution.
   *
   * @param regionIdentity - Opaque identity of the mounted anchor registered by the Page view.
   * @returns Detached geometry for the current query.
   * @throws When a measurement is unavailable or browser and ownership checks fail.
   */
  read(regionIdentity: RegionIdentity): BlockDropGeometry;
  /**
   * Reads layout direction for a mounted list host.
   *
   * @param regionIdentity - Opaque identity of the registered list host.
   * @returns Computed direction.
   * @throws When a measurement is unavailable or browser and ownership checks fail.
   */
  readDirection(regionIdentity: RegionIdentity): string;
  /**
   * Checks that all measurements and their attachment remain current.
   *
   * @returns False after an unavailable measurement or attachment replacement.
   * @throws Propagates ownership-check failures.
   */
  isCurrent(): boolean;
}

/** A terminal outline band; the final destination fills the remaining inline space. */
export interface BlockDropDepth {
  readonly destinations: readonly BlockDropDestination[];
  /** Number of indentation units extending toward ancestor lists. */
  readonly ancestors: number;
}

/** Data-only geometry attached to an existing element; no declaration creates layout space. */
export type BlockDropRegion = BlockDropEdgeRegion | BlockDropInsideRegion;

/** Inset strip along a logical edge of the registered element. */
export interface BlockDropEdgeRegion {
  readonly kind: "edge";
  readonly side: "block-start" | "block-end" | "inline-start" | "inline-end";
  /** Local CSS pixels; omission reads --rivto-drop-target-size, default 12. Capped to one third of the anchor axis and constrained by the registered own-content middle third, retaining body drops when descendants enlarge the shell. */
  readonly size?: number;
  /** Bounds accepts the whole anchor while retaining feedback on the declared edge; defaults to edge. */
  readonly coverage?: "edge" | "bounds";
  readonly destination: BlockDropDestination;
  readonly depth?: BlockDropDepth;
}

/** Explicit append area, optionally restricted to unoccupied layout background. */
export interface BlockDropInsideRegion {
  readonly kind: "inside";
  readonly coverage?: "bounds" | "background";
  readonly destination: BlockDropDestination;
}

/** Mounted anchor and live data-only geometry supplied by its JSX owner. */
export interface BlockDropTargetRegistration {
  /** Opaque identity of the mounted anchor; the mounting owner retains the element. */
  readonly identity: RegionIdentity;
  readonly priority?: number;
  /**
   * Reads committed region declarations without measuring or mutating DOM/model state.
   *
   * @returns Current regions; an empty array disables this anchor.
   */
  getRegions(): readonly BlockDropRegion[];
}

/** Captured installation fields; region declarations remain live until this entry is disposed. */
export interface BlockDropTargetEntry extends BlockDropTargetRegistration {
  readonly priority: number;
}

/** Feedback for matching sibling boundaries: one midpoint or the nearest anchor edge. */
export type BlockDropBoundaryMode = "merged" | "separate";

/** Finite nonnegative local CSS-pixel gutter extent, or the complete available row/column cross axis. */
export type BlockDropGutterSize = number | "row";

/** Existing ordered layout whose free gaps can connect mounted anchors. */
export interface BlockDropLayoutRegistration {
  /** Opaque identity of the mounted host; the mounting owner retains the element. */
  readonly identity: RegionIdentity;
  readonly axis: "vertical" | "horizontal" | "grid";
  readonly gaps: boolean;
  /** Finite nonnegative local CSS-pixel continuation distance; zero disables it and row fills the host cross axis. Defaults to row when gaps are enabled. */
  readonly gutterSize?: BlockDropGutterSize;
  /** Fill remaining free space before/after linear lists with endpoint boundaries; defaults to true. False retains the adjacent measured edge strips and leaves farther space to background declarations. */
  readonly endGaps?: boolean;
  /** Matching sibling edges share midpoint feedback by default. */
  readonly boundaries?: BlockDropBoundaryMode;
  /** Virtual lists require consecutive displayed indices, even across missing DOM roots. */
  readonly virtual?: boolean;
  /**
   * Reads the stable mounted-anchor list in visual flow order, without DOM measurements.
   *
   * @returns Committed anchors; undefined while a structural publication is pending.
   */
  getItems(): readonly BlockDropTargetRegistration[] | undefined;
}

/** Physical free space between two mounted placements; it has no synthetic DOM identity. */
export interface BlockDropGapRegion {
  readonly kind: "gap";
  /** Physical axis along which the gap separates its neighboring placements. */
  readonly axis: "vertical" | "horizontal";
}

/** Two-pixel insertion line measured in viewport CSS pixels during target resolution. */
export interface BlockDropIndicator {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Stable foreign attachment identity; detach subscription belongs to the active source gesture. */
export interface BlockDragTargetScope {
  /** Receiving region valid only for this exact registered attachment. */
  readonly region: InputRegion;
  /**
   * Requests focus for this receiving attachment without scrolling.
   *
   * A disposed or replaced receiving attachment must not focus a later one,
   * including when the same browser element is reused.
   *
   * @returns Focus has been requested when this receiver is still current and connected.
   * @throws Propagates browser focus failures.
   */
  focus(): void;
  /**
   * Observes release of this exact receiving attachment.
   *
   * @param listener - Cancels source feedback when this attachment is removed.
   * @returns Disposer removing only this listener; it never detaches the receiver.
   */
  onDetach(listener: () => void): () => void;
}

/** Registered region selected by hit testing; geometry is valid only for this resolution. */
export interface ResolvedBlockDropTarget {
  /** Foreign receiving attachment; omission keeps the gesture in its source occurrence. */
  readonly scope?: BlockDragTargetScope;
  /** Captured anchor used for feedback and receiving-surface ownership checks. */
  readonly anchor: InputRegion;
  /** Complete receiving hierarchy; omission paints the hit anchor. Bound to the resolving attachment. */
  readonly outline?: InputRegion;
  /** Boundary insertion line, including indented child append; absent for body/background inside regions and custom regions without line geometry. */
  readonly indicator?: BlockDropIndicator;
  readonly destination: BlockDropDestination;
  /** Physical region chosen before source exclusion. */
  readonly region?: BlockDropRegion | BlockDropGapRegion;
}

/** Browser-owned geometry candidate used before a drop result crosses the resolver boundary. */
export interface BlockDropGeometryTarget {
  readonly identity: RegionIdentity;
  readonly indicator?: BlockDropIndicator;
  readonly destination: BlockDropDestination;
  readonly region?: BlockDropRegion | BlockDropGapRegion;
}

/** Registration and native region resolution scoped to one editor attachment. */
export interface BlockDropTargetsApi {
  /**
   * Registers one mounted region until its disposer or editor cleanup runs.
   *
   * @param registration - Existing anchor, finite priority (default zero), and committed region declarations.
   * @returns Idempotent disposer removing this exact region, including duplicate elements.
   * @throws If destroyed or the priority is not finite.
   */
  register(registration: BlockDropTargetRegistration): () => void;
  /**
   * Finds a destination among registered ancestors of the browser's topmost hit.
   *
   * The nearest layout bounds discovery. Within an anchor, priority precedes
   * block edge, inline edge, inside, and registration order.
   * Browser hit testing respects clipping and overlapping views. The method validates
   * current parent existence and canonical neighbors. An optional acceptance callback
   * checks the winner without searching alternatives; mutation stays with the host.
   * Physical gaps binary-search ordered mounted anchors in that local layout;
   * only query-local rectangles are retained. No whole-document scan occurs.
   *
   * @param clientX - Viewport X coordinate in CSS pixels.
   * @param clientY - Viewport Y coordinate in CSS pixels.
   * @param excluded - Optional moving roots removed from validated gap neighbors.
   * @param hit - Connected uncaptured hit from the current input; omitted to hit-test current geometry.
   * @param accepts - Optional policy applied only to the selected region; rejection returns undefined.
   * @returns Selected region and destination, or undefined outside this attachment,
   * inside another editor, at nonfinite coordinates, or without a current valid target.
   * @throws If destroyed or delegated hit testing/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    hit?: BlockDragHit,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined;
  /**
   * Registers an existing layout and its ordered mounted anchors without changing its DOM.
   *
   * @param registration - Layout geometry policy and stable item publication.
   * @returns Disposer releasing only this layout attachment.
   */
  registerLayout(registration: BlockDropLayoutRegistration): () => void;
}

/** Host conversion of a foreign receiver's geometry and semantic acceptance. */
export interface BlockForeignDropResolver<T extends BlockDragTargetScope> {
  /**
   * Resolves a foreign receiver without repeating native hit testing.
   *
   * @param receiver - Live receiving identity selected by the shared registry.
   * @param x - Viewport X in CSS pixels.
   * @param y - Viewport Y in CSS pixels.
   * @param excluded - Source root IDs; their document meaning remains with the host.
   * @param hit - Current opaque hit, if any.
   * @returns Accepted canonical geometry, or undefined when the host rejects this drop.
   */
  resolveForeign(
    receiver: T,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hit: BlockDragHit | undefined,
  ): ResolvedBlockDropTarget | undefined;
}

/** Geometry capability borrowed by a drag gesture; the host selects its layout resolver. */
export interface BlockDragTargets {
  /**
   * Resolves a live destination while excluding captured moving subtrees.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @param excluded - Captured moving roots, including unmounted selection.
   * @param hit - Opaque uncaptured pointer hit, omitted during pointer capture, scroll reconciliation and release so those paths resolve current geometry.
   * @returns Current target, or undefined when no eligible region is hit.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hit?: BlockDragHit,
  ): ResolvedBlockDropTarget | undefined;
}
