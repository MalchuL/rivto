import type { InputRegion, InputRoot, PathOverlay } from "@chulane/rivto-root";
import type { PanelInputRegistration, ReactPanelSurfaceApi } from "../../panels/types";

/**
 * Resolves the visible control or slot used as a block's thread endpoint.
 *
 * The returned identity must resolve to a region within this block in the current
 * occurrence. Detached, foreign, and zero-size anchors do not produce a point.
 *
 * @param block - Captured block region whose children can be inspected.
 * @returns A region inside the block, or undefined when the block should be skipped.
 * @throws Propagates failures from caller-provided region operations.
 */
export type BulletThreadingAnchor = (
  block: Pick<InputRegion, "captureChildren">,
) => Pick<InputRegion, "getIdentity"> | undefined;

/** Configuration for the optional page-surface bullet-threading overlay. */
export interface BulletThreadingOptions {
  /** Resolve an anchor from each rendered block. Return undefined to skip that block. */
  readonly anchor: BulletThreadingAnchor;
  /** Horizontal distance from a root anchor to its vertical line, in CSS pixels. Defaults to 12. */
  readonly rootLineOffset?: number;
  /** Block types where the thread stops before descendants; the root-level line still reaches them. Takes precedence over continueBlockTypes. */
  readonly excludeBlockTypes?: readonly string[];
  /** When provided, only these block types can carry a thread to descendants. */
  readonly continueBlockTypes?: readonly string[];
}

/** Measured anchor coordinates relative to the body-hosted overlay. */
export interface ThreadPoint {
  /** Horizontal center of the anchor. */
  readonly x: number;
  /** Vertical center of the anchor. */
  readonly y: number;
  /** Bottom edge used when a root trunk continues below an earlier block. */
  readonly bottom: number;
}

/** Occurrence regions and traversal rules used to build a thread path. */
export interface ThreadPathOptions {
  readonly root: InputRegion;
  readonly inputRoot: Pick<InputRoot, "someTopLevelRegion">;
  readonly focused: InputRegion;
  readonly rootLineOffset: number;
  readonly excluded: ReadonlySet<string>;
  readonly continued: ReadonlySet<string> | null;
  /**
   * Measures the current anchor for a rendered block.
   *
   * @param block - Occurrence-owned block whose anchor is needed.
   * @returns Overlay-relative point, or null when no visible anchor exists.
   */
  readonly point: (block: InputRegion) => ThreadPoint | null;
}

/** Borrowed occurrence and path overlay used by one threading observation. */
export interface ThreadObservationOptions {
  readonly inputRoot: Omit<ThreadOverlayRoot, "createPathOverlay">;
  /** Routing lifetime that owns the observation. */
  readonly inputRegistration: PanelInputRegistration;
  readonly overlay: PathOverlay;
  readonly anchor: BulletThreadingAnchor;
  readonly rootLineOffset: number;
  readonly excluded: ReadonlySet<string>;
  readonly continued: ReadonlySet<string> | null;
}

/** Root operations borrowed by the threading overlay and its owner. */
export type ThreadOverlayRoot = Pick<
  InputRoot,
  | "isAttached"
  | "getElementIdentity"
  | "captureRegionByIdentity"
  | "captureFocusedRegion"
  | "captureFrameClock"
  | "observeWindowInput"
  | "someTopLevelRegion"
  | "createPathOverlay"
>;

/** Current occurrence read borrowed by the overlay owner. */
export interface ThreadOverlayPanel extends Pick<ReactPanelSurfaceApi, "subscribeAvailability"> {
  readonly inputRoot?: ThreadOverlayRoot;
}
