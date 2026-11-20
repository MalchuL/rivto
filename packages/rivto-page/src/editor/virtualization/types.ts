import type { InputRoot, RegionIdentity } from "@chulane/rivto-root";

/** Starts geometry observation for one mounted view. */
export interface BlockVirtualizationGeometryObserver {
  /**
   * Starts observing the view's geometry.
   *
   * @param root - Borrowed occurrence used to capture the measured region.
   * @returns Disposer releasing observation resources for this attachment.
   * @throws If observation setup or its rollback fails.
   */
  (root: Pick<InputRoot, "captureRegionByIdentity">): () => void;
}

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

/** Mounted view operations needed by its editor-owned registration. */
export interface BlockVirtualizationView extends BlockVirtualizationApi {
  /**
   * Observes focus and selection through the matching mounted Root.
   *
   * @param root - Borrowed occurrence capability; the editor retains its lifecycle.
   * @returns Disposer releasing only this view's Root observation.
   * @throws Propagates listener setup and initial observation failures.
   */
  observeRoot(root: Pick<InputRoot, "observeTextOwners" | "captureRegionByIdentity">): () => void;
}

/** One mounted view registration retained by its owning editor. */
export interface BlockVirtualizationEntry {
  /** Mounted surface identity belonging to this view registration. */
  readonly identity: RegionIdentity;
  /** View operations borrowed from the registered view. */
  readonly view: BlockVirtualizationView;
  /** Binding that owns the current observation, when connected. */
  binding?: BlockVirtualizationBinding;
  /** Releases the view's observation for its current binding. */
  releaseObservation?: () => void;
}

/** One editor attachment and its exact borrowed Root. */
export interface BlockVirtualizationBinding {
  /** Mounted surface identity belonging to this occurrence. */
  readonly identity: RegionIdentity;
  /** Borrowed Root operations bounded by the owning editor attachment. */
  readonly occurrence: Pick<
    InputRoot,
    "observeTextOwners" | "captureRegionByIdentity" | "isAttached"
  >;
}
