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
  /** Local CSS pixels; omission reads --rivto-drop-target-size, default 8. */
  readonly size?: number;
  /** Bounds accepts the whole anchor while retaining feedback on the declared edge; defaults to edge. */
  readonly coverage?: "edge" | "bounds";
  readonly destination: BlockDropDestination;
  readonly depth?: BlockDropDepth;
  /** Logical-start inset for block-edge feedback in local CSS pixels; negative extends the line without changing hit coverage. Ignored by inline edges. */
  readonly indicatorInset?: number;
}

/** Explicit append area, optionally restricted to unoccupied layout background. */
export interface BlockDropInsideRegion {
  readonly kind: "inside";
  readonly coverage?: "bounds" | "background";
  readonly destination: BlockDropDestination;
}

/** Mounted anchor and live data-only geometry supplied by its JSX owner. */
export interface BlockDropTargetRegistration {
  readonly element: HTMLElement;
  readonly priority?: number;
  /**
   * Reads committed region declarations without measuring or mutating DOM/model state.
   *
   * @returns Current regions; an empty array disables this anchor.
   */
  getRegions(): readonly BlockDropRegion[];
}

/** Feedback for matching sibling boundaries: one midpoint or the nearest anchor edge. */
export type BlockDropBoundaryMode = "merged" | "separate";

/** Existing ordered layout whose free gaps can connect mounted anchors. */
export interface BlockDropLayoutRegistration {
  readonly element: HTMLElement;
  readonly axis: "vertical" | "horizontal" | "grid";
  readonly gaps: boolean;
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
  readonly previous: BlockDropTargetRegistration;
  readonly next: BlockDropTargetRegistration;
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
  readonly root: HTMLElement;
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
  readonly element: HTMLElement;
  /** Absent for inside targets and custom regions without line geometry. */
  readonly indicator?: BlockDropIndicator;
  readonly destination: BlockDropDestination;
  /** Physical region chosen before source exclusion. */
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
   * @param nativeHit - Connected uncaptured hit from the current native event; omitted to hit-test current geometry.
   * @param accepts - Optional policy applied only to the selected region; rejection returns undefined.
   * @returns Selected region and destination, or undefined outside this attachment,
   * inside another editor, at nonfinite coordinates, or without a current valid target.
   * @throws If destroyed or delegated hit testing/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    nativeHit?: Element,
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
