import type { BentoResizeController } from "./bento-resize-controller";
import type { InputInlineStyleSession, InputRegion } from "@chulane/rivto-root";
import type { CSSProperties } from "react";
import type { BENTO_WIDTH_PROPERTY } from "./bento-constants";
import type { PanelInputRoot, ReactPanelSurfaceApi } from "../../../panels/types";

/** Edge of a tile used as the resize origin. */
export type BentoResizeEdge = "left" | "right";

/** One occurrence's registered separator listeners. */
export interface BentoResizeInputAttachment {
  /** Borrowed panel Root that owns the separator region. */
  readonly root: PanelInputRoot;
  /** Region-scoped listener cleanups owned by this attachment. */
  readonly releases: Array<() => void>;
}

/** One temporary inline declaration owned by a resize gesture. */
export interface TileInlineStyle {
  readonly name: string;
  readonly session: InputInlineStyleSession;
}

/** One measured placement and the inline declarations restored when its gesture ends. */
export interface FrozenTile {
  readonly region: InputRegion;
  readonly width: number;
  readonly styles: TileInlineStyle[];
  releaseMarker?: () => void;
}

/** Active pointer resize state retained without rerendering on every pixel. */
export interface TileResizeGesture {
  readonly pointerId: number;
  readonly edge: BentoResizeEdge;
  readonly startX: number;
  readonly startWidth: number;
  readonly frozen: readonly FrozenTile[];
  readonly tile: FrozenTile;
  releasePointer?: () => void;
  releaseListeners?: () => void;
  releaseFeedback?: () => void;
  width: number;
}

/** Width is a placement property; the existing child block retains its own layout. */
export interface BentoTilePlacementStyle extends CSSProperties {
  readonly [BENTO_WIDTH_PROPERTY]: string;
}

/** Persisted tile identity borrowed by its mounted resize controls. */
export interface BentoResizeHandlesProps {
  readonly blockId: string;
}

/** Gesture capabilities borrowed from the mounted separator. */
export interface BentoResizeStart {
  readonly feedback: Pick<InputRegion, "setTemporaryAttribute">;
  /** Placement and its sibling container, captured for this input attachment. */
  readonly placement: BentoResizePlacement | undefined;
  /**
   * Observes window cancellation for the active gesture.
   *
   * @param cancel - Restores the active resize without committing it.
   * @returns Disposer removing the gesture's cancellation listeners.
   * @throws If listener setup or cleanup fails.
   */
  subscribeCancellation(cancel: () => void): () => void;
}

/** Tile and containing lane borrowed for one resize gesture. */
export interface BentoResizePlacement {
  readonly tile: InputRegion;
  readonly lane: InputRegion;
}

/** Input and presentation for one mounted Bento resize separator. */
export interface BentoResizeHandleProps {
  readonly edge: BentoResizeEdge;
  readonly width: number;
  readonly panel: Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">;
  readonly controller: Pick<
    BentoResizeController,
    "start" | "move" | "finish" | "resizeWithKeyboard"
  >;
}
