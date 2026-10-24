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
 * @returns Whether this destination may participate in nearest-position selection.
 */
export type BlockDropAcceptance = (destination: BlockDropDestination) => boolean;

/** Mounted DOM region and a live destination supplied by its JSX owner. */
export interface BlockDropTargetRegistration {
  readonly element: HTMLElement;
  readonly priority?: number;
  /** Optional line orientation through the center of a between region; inside targets keep their outline. */
  readonly indicatorAxis?: "horizontal" | "vertical";
  /**
   * Reads the region's latest committed destination without measuring the document.
   *
   * Reads must be synchronous and side-effect free; permissions and mutation are separate.
   *
   * @returns Current destination, or undefined when the region is unavailable.
   * @throws Propagates host destination-read failures.
   */
  getDestination(): BlockDropDestination | undefined;
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
}

/** Registration and geometry-only resolution scoped to one editor attachment. */
export interface BlockDropTargetsApi {
  /**
   * Registers one mounted region until its disposer or editor cleanup runs.
   *
   * @param registration - DOM region, finite priority (default zero), and live destination read.
   * @returns Idempotent disposer removing this exact region, including duplicate elements.
   * @throws If destroyed or the priority is not finite.
   */
  register(registration: BlockDropTargetRegistration): () => void;
  /**
   * Finds a destination among registered ancestors of the browser's topmost hit.
   *
   * Higher priorities win, then the closest DOM ancestor, then earlier registration.
   * Browser hit testing respects clipping and overlapping views. The method validates
   * current parent existence and canonical neighbors; it neither checks move permissions
   * nor changes data. No targets or rectangles outside the hit's ancestors are read.
   *
   * @param clientX - Viewport X coordinate in CSS pixels.
   * @param clientY - Viewport Y coordinate in CSS pixels.
   * @param excluded - Optional moving roots removed from validated gap neighbors.
   * @param nativeHit - Connected uncaptured hit from the current native event; omitted to hit-test current geometry.
   * @returns Selected region and destination, or undefined outside this attachment,
   * inside another editor, at nonfinite coordinates, or without a current valid target.
   * @throws If destroyed or delegated hit testing/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    nativeHit?: Element,
  ): ResolvedBlockDropTarget | undefined;
  /**
   * Resolves registered ancestors of a native hit already obtained in this synchronous lookup.
   *
   * Attachment isolation, priority and current destination checks match resolve;
   * callers must not retain a hit across layout changes or native input events.
   *
   * @param element - Current browser hit, or null when nothing was hit.
   * @param excluded - Optional moving roots omitted from validated neighbors.
   * @returns Current region, or undefined for foreign, detached or unavailable targets.
   * @throws If destroyed or a destination read fails.
   */
  resolveHit(
    element: Element | null,
    excluded?: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined;
}
