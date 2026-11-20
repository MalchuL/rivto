import type { CSSProperties } from "react";
import type { ConnectorTextRotation } from "../../elements/visuals/types";
import type { EdgelessTransformController } from "./edgeless-transform";
import type {
  PanelInputRegistration,
  ReactPanelApi,
  ReactPanelSurfaceApi,
} from "../../panels/types";
import type { CanvasControlHandle } from "@chulane/rivto-edgeless/react";
import type { EdgelessSelectionPanel } from "../built-ins/selection/types";
import type { InputRegionStyleSession, InputRoot } from "@chulane/rivto-root";
import type { EditorElementFrame } from "@chulane/rivto";
import type { ConnectorPreviewTarget } from "./edgeless-transform-connectors";
import type { ElementGeometry } from "../../elements/element-geometry";

/** Document transform owner used by the canvas controls. */
export interface EdgelessTransformControlsProps {
  readonly controller: EdgelessTransformController;
}

/** Occurrence operations borrowed by the mounted marquee controller. */
export interface EdgelessMarqueePanel extends Pick<
  ReactPanelSurfaceApi,
  "subscribeAvailability" | "inputRegistration"
> {
  /** Current Root used to bind selection to the exact occurrence. */
  readonly inputRoot?: Pick<
    InputRoot,
    | "isAttached"
    | "getElementIdentity"
    | "readAttribute"
    | "captureRegionByIdentity"
    | "createRectangleOverlay"
  >;
  /** Reads group records when marquee geometry is captured. */
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes">;
  /** Registers only the pointer observations owned by the controller. */
  readonly events: Pick<ReactPanelApi["events"], "register">;
}

/** Panel hierarchy read used to remove selected descendants. */
export interface EdgelessBlockParentPanel {
  /** Reads a block's direct parent in this occurrence. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getParentId">;
}

/** Panel operations borrowed by canvas keyboard movement. */
export interface EdgelessMovementPanel extends EdgelessSelectionPanel {
  /** Reads and updates selected canvas element geometry. */
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNode" | "updateElements">;
}
/** Captured presentation of one rendered transform participant. */
export interface TransformPreviewTarget {
  readonly id: string;
  readonly styles: InputRegionStyleSession;
  readonly releaseLock: () => void;
}

/** Geometry computed by Moveable for one leaf, in canvas units and clockwise degrees. */
export interface ElementTransformPreview {
  readonly id: string;
  readonly frame: EditorElementFrame;
  readonly rotation: number;
  /** CSS transform supplied by Moveable while persisted left/top remain fixed. */
  readonly transform?: string;
}

/** Object selected by a pointer hit and an optional parent to restore after a click. */
export interface PointerTransformTarget {
  readonly id: string;
  readonly returnToGroup?: string;
}

export interface TransformStart {
  /** Input Root that admitted this gesture. */
  readonly inputRoot: Pick<InputRoot, "isAttached" | "findRegions">;
  /** Exact routing lifetime that admitted this gesture. */
  readonly inputRegistration: PanelInputRegistration;
  /** Restores the occurrence's transform marker when the gesture ends. */
  readonly releaseTransformMarker: () => void;
  /** Moveable tracks all three gestures; the editor stores their initial geometry. */
  readonly kind: "move" | "resize" | "rotate";
  previews?: ReadonlyMap<string, ElementTransformPreview>;
  groupRotations?: Map<string, number>;
  previewGeometry?: ElementGeometry;
  stopMoveable?: () => void;
  dx: number;
  dy: number;
  readonly ids: string[];
  readonly frames: Map<string, EditorElementFrame>;
  /** Leaf IDs in this gesture, including group children. */
  readonly moving: ReadonlySet<string>;
  /** Connectors that must live-preview; empty means pointermove skips overlay work. */
  readonly attachedConnectors: readonly ConnectorPreviewTarget[];
  /**
   * AFFiNE progressive groups: after drilling into a child, a click-without-drag
   * should re-select this parent group (exit drill-in) instead of leaving the child selected.
   */
  readonly returnToGroup?: string;
  moved: boolean;
}

/** Controls and routing lifetime installed for one panel. */
export interface TransformControlsRegistration {
  /** Moveable operations borrowed from the mounted controls. */
  readonly controls: CanvasControlHandle;
  /** Routing lifetime that owns the controls. */
  readonly inputRegistration: PanelInputRegistration;
}

/** Detached appearance and world geometry for a connector transform preview. */
export interface ConnectorTransformPreview {
  readonly id: string;
  readonly path: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly lineStyle: "solid" | "dashed" | "dashed-animated";
  readonly startArrow: boolean;
  readonly endArrow: boolean;
  readonly label?: ConnectorTransformPreviewLabel;
}

/** Detached connector label content and world position during a transform. */
export interface ConnectorTransformPreviewLabel {
  readonly text: string;
  readonly textRotation: ConnectorTextRotation;
  readonly x: number;
  readonly y: number;
  readonly degrees: number;
  readonly color: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly align: CSSProperties["textAlign"];
}

/** Preview data and subscription borrowed by the canvas overlay renderer. */
export interface ConnectorTransformPreviewProps {
  readonly controller: Pick<
    EdgelessTransformController,
    "subscribeConnectorPreview" | "getConnectorPreview"
  >;
}

/** One connector's preview data passed to its SVG and label renderers. */
export interface ConnectorTransformItemProps {
  readonly preview: ConnectorTransformPreview;
}
