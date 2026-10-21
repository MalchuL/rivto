/** Candidate appending children to an existing real block. Permission is checked on future commit. */
export interface InsideBlockDropDestination {
  readonly kind: "inside";
  readonly parentId: string;
}

/** Canonical gap in an existing parent's actual ordered child IDs. */
export interface BetweenBlockDropDestination {
  readonly kind: "between";
  readonly parentId: string;
  readonly previousId: string | null;
  readonly nextId: string | null;
}

/** Geometry-selected destination, not authorization to mutate the document. */
export type BlockDropDestination = InsideBlockDropDestination | BetweenBlockDropDestination;

/** Mounted DOM region and a live destination supplied by its JSX owner. */
export interface BlockDropTargetRegistration {
  readonly element: HTMLElement;
  readonly priority?: number;
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

/** Registered region selected by hit testing; geometry remains live on its element. */
export interface ResolvedBlockDropTarget {
  readonly element: HTMLElement;
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
   * @returns Selected region and destination, or undefined outside this attachment,
   * inside another editor, at nonfinite coordinates, or without a current valid target.
   * @throws If destroyed or delegated hit testing/data reads fail.
   */
  resolve(clientX: number, clientY: number): ResolvedBlockDropTarget | undefined;
}
