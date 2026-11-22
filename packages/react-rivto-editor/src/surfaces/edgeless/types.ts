import type { CanvasApi, EdgelessSnappingStore } from "@chulane/rivto-edgeless";
import type {
  FrameClock,
  InputRegion,
  InputRegionStyleSession,
  InputRoot,
} from "@chulane/rivto-root";
import type { RefCallback } from "react";
import type { PanelInputRoot, ReactPanelApi, ReactPanelSurfaceApi } from "../../panels/types";
import type { EdgelessSurfaceController } from "./edgeless-surface-controller";
import type { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";

/** Panel operations borrowed by mounted card height observation. */
export interface EdgelessCardHeightPanel extends Pick<
  ReactPanelSurfaceApi,
  "subscribeAvailability" | "batchUpdatesWithoutHistory"
> {
  readonly mountedRoot: Pick<InputRoot, "isAttached" | "captureRegionByIdentity"> | undefined;
  readonly elements: Pick<ReactPanelSurfaceApi["elements"], "getElementNode" | "updateElements">;
}

/** Document parent lookup borrowed by the canvas projection. */
export interface EdgelessCanvasDocument {
  readonly blocks: Pick<ReactPanelApi["document"]["blocks"], "getParentIds">;
}

/** Shared document notifications and element definitions borrowed by the projection. */
export interface EdgelessCanvasSourceEditor extends Pick<ReactPanelApi["editor"], "subscribe"> {
  readonly elementTypes: Pick<ReactPanelApi["editor"]["elementTypes"], "get" | "subscribe">;
}

/** Borrowed document reads and subscriptions needed by the canvas projection. */
export interface EdgelessCanvasSourcePanel {
  readonly rootBlockId?: string;
  readonly document: EdgelessCanvasDocument;
  readonly blocks: Pick<ReactPanelApi["blocks"], "getRootIds" | "getParentId">;
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNode" | "getElementNodes">;
  readonly selection: Pick<ReactPanelApi["selection"], "get" | "subscribe">;
  readonly editor: EdgelessCanvasSourceEditor;
}
export type { EdgelessSnappingSnapshot } from "@chulane/rivto-edgeless";
/**
 * Host-owned snapping preferences for the optional edgeless surface.
 *
 * The store remains outside persisted document state and exposes the stable
 * subscription contract consumed by React's external-store hook.
 *
 * @module
 */
/** Options accepted by the built-in edgeless surface extension. */
export interface EdgelessSurfaceOptions {
  /** Shared settings store; a private default store is created when omitted. */
  readonly snapping?: EdgelessSnappingStore;
  /** Places newly created block cards away from existing block cards. */
  readonly avoidBlockElementOverlap?: boolean;
  /** Width of newly created block cards in canvas units; defaults to the 720px page width. */
  readonly blockElementWidth?: number;
}

/** Document policy borrowed by the canvas card-creation registration. */
export interface EdgelessCardCreationProps {
  readonly controller: Pick<EdgelessSurfaceController, "createBlockAt">;
}

/** Pointer decoration receiving the current viewport's input. */
export interface EdgelessSpotlightInputProps {
  readonly spotlight: Pick<
    EdgelessGridSpotlight,
    "refreshViewportOrigin" | "updatePointerSpotlight"
  >;
}

/** Resources owned by one attached spotlight occurrence. */
export interface EdgelessSpotlightAttachment {
  /** Exact occurrence used to check ownership and pan state. */
  readonly root: Pick<InputRoot, "isAttached" | "readAttribute">;
  /** Region supplying viewport measurements. */
  readonly viewport: Pick<InputRegion, "readBounds" | "observeBounds">;
  /** Owned session for the spotlight overlay's CSS properties. */
  readonly styles: Pick<InputRegionStyleSession, "set" | "finish">;
  /** Scheduler bound to the occurrence's browser window. */
  readonly clock: Pick<FrameClock, "requestFrame">;
  /** Releases viewport geometry observation when installed. */
  releaseBounds?: () => void;
  /** Cancels the pending spotlight frame when scheduled. */
  cancelFrame?: () => void;
}

/** Live camera and snapping values presented by the viewport toolbar. */
export interface ZoomControlProps {
  readonly canvas: Pick<CanvasApi, "zoomAt">;
  readonly snapping: Pick<EdgelessSnappingStore, "set">;
  readonly snap: ReturnType<EdgelessSnappingStore["getSnapshot"]>;
  readonly zoom: number;
}

/** Screen-space viewport UI and its mounted spotlight identity. */
export interface SurfaceOverlayProps extends ZoomControlProps {
  readonly spotlightRef: RefCallback<HTMLDivElement>;
}

/** Occurrence operations borrowed by pan state and its temporary markers. */
export type EdgelessPanRoot = Pick<
  InputRoot,
  "isAttached" | "readAttribute" | "setTemporaryAttribute"
>;

/** Marker ownership retained only for one mounted pan occurrence. */
export interface EdgelessPanAttachment {
  /** Exact occurrence that owns these temporary markers. */
  readonly root: EdgelessPanRoot;
  /** Restores the previous pan-ready marker. */
  ready?: () => void;
  /** Restores the previous active-pan marker. */
  active?: () => void;
}

/** One of the two pan markers owned by the active occurrence. */
export type EdgelessPanMarker = "ready" | "active";

/** Shared block definitions borrowed for new-card creation. */
export interface EdgelessSurfaceDocument {
  readonly blockTypes: Pick<
    ReactPanelApi["editor"]["blockTypes"],
    "separatesBlockElements" | "getDefaultBlockElementSeparatorType"
  >;
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "createEmptyBlock"
  >;
}

/** Document operations borrowed by viewport gestures without lifecycle ownership. */
export interface EdgelessSurfacePanel extends Pick<ReactPanelApi, "batchUpdates"> {
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    "getRootIds" | "getBlockNode" | "canRemove" | "insertBlock" | "getInsertionDestinationAfter"
  >;
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes" | "insertElement">;
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "set" | "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
  readonly editor: EdgelessSurfaceDocument;
}

/** Panel availability borrowed by the surface mounting boundary. */
export type EdgelessRootPanel = Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">;

/** Mounting references and current Root used by one edgeless surface. */
export interface EdgelessSurfaceRootBindings {
  /** Mounted viewport when it matches the current Page scope. */
  readonly scopeInputRoot: PanelInputRoot | undefined;
  /** Mounts the viewport at the React boundary. */
  readonly viewportRef: RefCallback<HTMLElement>;
  /** Captures the spotlight overlay identity at the React boundary. */
  readonly spotlightRef: RefCallback<HTMLDivElement>;
  /** Current occurrence capability, absent while unregistered. */
  readonly inputRoot?: PanelInputRoot;
}
