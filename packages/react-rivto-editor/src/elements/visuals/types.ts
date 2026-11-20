import type { EditorElementNode } from "@chulane/rivto";
import type { Point } from "@chulane/rivto-edgeless";
import type { InputRegion, InputRoot, KeyInput, PointerInput } from "@chulane/rivto-root";
import type { ComponentType, Dispatch, RefCallback, RefObject, SetStateAction } from "react";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { ReactPanelApi } from "../../panels/types";
import type { EditableLabelFocusPoint } from "../../components";
import type { EdgelessSelectionRef } from "../../extensions/built-ins/selection/types";

export type { EdgelessSelectionRef } from "../../extensions/built-ins/selection/types";

/** Axis-aligned canvas geometry shared by every visual leaf. */
export interface VisualFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisualBase {
  readonly id: string;
  frame: VisualFrame;
  zIndex: number;
}
interface RotatableVisualBase extends VisualBase {
  rotation: number;
}

/** Freehand brush preset stored with each drawing. */
export type EdgelessBrush = "pencil" | "pen" | "marker";
/** Connector routing algorithm. */
export type ConnectorRoute = "straight" | "orthogonal" | "curve";
/** Decoration rendered at either end of a connector. */
export type ConnectorEndpointStyle = "none" | "arrow";
/**
 * Stroke pattern for connectors.
 *
 * `dashed-animated` uses a moving dash pattern that flows source → target.
 */
export type ConnectorLineStyle = "solid" | "dashed" | "dashed-animated";
/**
 * Connector label orientation.
 *
 * `along` follows the path tangent and is normalized so the text stays upright
 * (angles near 180° become 0°).
 */
export type ConnectorTextRotation = "horizontal" | "90" | "180" | "270" | "along";

/** Stable attachment plus the last absolute point used if its object disappears. */
export interface ConnectorEndpoint {
  elementId?: string;
  anchor: { x: number; y: number };
  position: { x: number; y: number };
}

/** Connector reconnection hit testing and attachment feedback for one canvas. */
export interface ConnectorInteraction {
  /** Current panel input Root, absent while the occurrence is unavailable. */
  readonly inputRoot: Pick<InputRoot, "isAttached" | "captureRegionByIdentity"> | undefined;
  /**
   * Resolves client coordinates to a connector attachment or free endpoint.
   *
   * @param point - Pointer position in client CSS pixels.
   * @returns Endpoint at the pointer's current position, or undefined when the
   * captured canvas attachment is unavailable.
   */
  resolveEndpoint(point: Point): ConnectorEndpoint | undefined;
  /**
   * Updates the reconnect hover target, or clears it when the pointer is absent.
   *
   * @param point - Pointer position in client CSS pixels, or null to clear feedback.
   * @returns Updates or clears panel-local attachment feedback without document writes.
   */
  onReconnectHover(point: Point | null): void;
}

/** Pointer and attachment-specific interaction retained for one reconnect gesture. */
export interface ConnectorGesture {
  readonly pointerId: number;
  readonly interaction: ConnectorInteraction;
  /** Releases the capture owned by this exact gesture. */
  readonly releasePointer: () => void;
}

/** Pointer delivery for one of a connector's mounted endpoint controls. */
export type ConnectorEndpointKey = "source" | "target";

/** React mounting callbacks for the two reconnect controls. */
export type ConnectorEndpointRefs = Record<ConnectorEndpointKey, RefCallback<HTMLButtonElement>>;

/** Pointer capture retained while adjusting a rectangle's corner radius. */
export interface RectangleRadiusGesture {
  readonly pointerId: number;
  readonly releasePointer: () => void;
}

/** Live renderer state borrowed for one radius input delivery. */
export interface RectangleRadiusState {
  readonly elementId: string;
  readonly saved: number;
  readonly maximum: number;
  readonly radius: number;
  readonly offset: number;
  readonly draft: number | null;
  readonly gesture: RefObject<RectangleRadiusGesture | null>;
  readonly setDraft: Dispatch<SetStateAction<number | null>>;
  readonly operations: Pick<EdgelessOperations, "updateProperties">;
}

/** Rectangle rendering inputs including resolved stroke and fill. */
export interface RectangleShapeProps extends ElementRenderProps {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** Content rendered inside a visual host when its panel and renderer are available. */
export interface VisualElementContentProps extends Omit<
  ElementRenderProps,
  "preview" | "reactPanel"
> {
  readonly Renderer: ComponentType<ElementRenderProps> | undefined;
  readonly reactPanel: ReactPanelApi | undefined;
}

/** Local editing and requested caret state for one visual label. */
export interface VisualLabelEditing {
  readonly editing: boolean;
  readonly setEditing: Dispatch<SetStateAction<boolean>>;
  readonly focusPointRef: RefObject<EditableLabelFocusPoint | null>;
  /**
   * Starts editing at the input's viewport position.
   *
   * @param point - Viewport point used for initial caret placement.
   * @returns The visual enters editing with the point retained for its label.
   */
  startEditing(point: EditableLabelFocusPoint): void;
}

/** Visual placement and mounted identity of the radius slider. */
export interface RectangleRadiusHandleProps {
  readonly handle: RefObject<SVGCircleElement | null>;
  readonly radius: number;
  readonly maximum: number;
  readonly offset: number;
  readonly scale: number;
}

/** Rectangle-owned policy invoked by a mounted radius handle's Root input. */
export interface RectangleRadiusInputHandlers {
  /**
   * Applies normalized pointer input to the current radius gesture.
   *
   * @param input - Pointer delivery for the handle.
   * @param region - Captured handle geometry for this Root attachment.
   * @returns The gesture has been started, updated, finished, or cancelled.
   * @throws Propagates capture, geometry, and document update failures.
   */
  onPointer(input: PointerInput, region: Pick<InputRegion, "clientToSvgPoint">): void;
  /**
   * Applies a normalized keyboard action to the radius.
   *
   * @param input - Key delivered to the focused handle.
   * @returns A recognized key has updated or cancelled the radius.
   * @throws Propagates document update failures.
   */
  onKey(input: KeyInput): void;
  /**
   * Cancels the current radius gesture when the handle loses its attachment.
   *
   * @returns Capture and local preview are released without committing.
   * @throws Propagates capture cleanup failures.
   */
  cancel(): void;
}

/** Horizontal placement of text inside a frame or label. */
export type TextHorizontalAlign = "left" | "center" | "right";
/** Vertical placement of text inside a frame or label. */
export type TextVerticalAlign = "top" | "middle" | "bottom";

/** Styled editable sticky note. */
export interface StickerVisual extends RotatableVisualBase {
  readonly kind: "sticker";
  text: string;
  fill: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  align: TextHorizontalAlign;
  verticalAlign: TextVerticalAlign;
}

/** Freehand stroke whose points are stored relative to its frame. */
export interface DrawingVisual extends RotatableVisualBase {
  readonly kind: "drawing";
  points: Array<{ x: number; y: number; pressure?: number }>;
  brush: EdgelessBrush;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** Rectangle or ellipse with fill, stroke, and optional centered label. */
export interface ShapeVisual extends RotatableVisualBase {
  readonly kind: "rectangle" | "ellipse";
  /** Rectangle corner radius in canvas units; SVG limits it to half the available size. */
  cornerRadius?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** When false, the shape fill is not painted (color is kept for re-enable). */
  filled: boolean;
  /** When false, the shape stroke is not painted (color/width kept for re-enable). */
  stroked: boolean;
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  align: TextHorizontalAlign;
  verticalAlign: TextVerticalAlign;
}

/** Canvas text independent from document blocks. */
export interface TextVisual extends RotatableVisualBase {
  readonly kind: "text";
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  align: TextHorizontalAlign;
  verticalAlign: TextVerticalAlign;
}

/** Arrow whose endpoints can remain attached to first-class canvas elements. */
export interface ConnectorVisual extends VisualBase {
  readonly kind: "connector";
  source: ConnectorEndpoint;
  target: ConnectorEndpoint;
  route: ConnectorRoute;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: ConnectorLineStyle;
  startStyle: ConnectorEndpointStyle;
  endStyle: ConnectorEndpointStyle;
  text: string;
  textRotation: ConnectorTextRotation;
  color: string;
  fontFamily: string;
  fontSize: number;
  align: TextHorizontalAlign;
  verticalAlign: TextVerticalAlign;
}

/** React visual view materialized from a first-class document element. */
export type EdgelessVisual =
  StickerVisual | DrawingVisual | ShapeVisual | TextVisual | ConnectorVisual;

/** Persisted logical group element; children are first-class element IDs. */
export interface VisualGroup {
  readonly id: string;
  title: string;
  children: EdgelessSelectionRef[];
}

/** Font offered by text and sticky-note property menus. */
export interface EdgelessFontOption {
  readonly label: string;
  readonly fontFamily: string;
}

/** Styled sticky-note preset offered by the creation picker. */
export interface EdgelessStickerOption {
  readonly id: string;
  readonly label: string;
  readonly fill: string;
  readonly color?: string;
  readonly fontFamily?: string;
}

/** Behavior used when an attached connector endpoint loses its object. */
export type OrphanConnectorBehavior = "detach" | "delete";

/** Payload accepted by `edgeless.visual.create`. */
export type CreateVisualPayload =
  | {
      kind: "sticker";
      frame?: Partial<VisualFrame>;
      rotation?: number;
      text?: string;
      fill?: string;
      color?: string;
      fontFamily?: string;
      fontSize?: number;
      align?: TextHorizontalAlign;
      verticalAlign?: TextVerticalAlign;
    }
  | {
      kind: "drawing";
      frame: VisualFrame;
      rotation?: number;
      points: DrawingVisual["points"];
      brush?: EdgelessBrush;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      kind: "connector";
      frame?: Partial<VisualFrame>;
      source: ConnectorEndpoint;
      target: ConnectorEndpoint;
      route?: ConnectorRoute;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      lineStyle?: ConnectorLineStyle;
      startStyle?: ConnectorEndpointStyle;
      endStyle?: ConnectorEndpointStyle;
      text?: string;
      textRotation?: ConnectorTextRotation;
      color?: string;
      fontFamily?: string;
      fontSize?: number;
      align?: TextHorizontalAlign;
      verticalAlign?: TextVerticalAlign;
    }
  | {
      kind: "rectangle" | "ellipse";
      frame?: Partial<VisualFrame>;
      rotation?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      /** Rectangle corner radius in canvas units; defaults to 3. */
      cornerRadius?: number;
      filled?: boolean;
      stroked?: boolean;
      text?: string;
      color?: string;
      fontFamily?: string;
      fontSize?: number;
      align?: TextHorizontalAlign;
      verticalAlign?: TextVerticalAlign;
    }
  | {
      kind: "text";
      frame?: Partial<VisualFrame>;
      rotation?: number;
      text?: string;
      color?: string;
      fontFamily?: string;
      fontSize?: number;
      align?: TextHorizontalAlign;
      verticalAlign?: TextVerticalAlign;
    };

/** Click/drag presets from the create toolbar (not drawing or connector tools). */
export type PresetPayload = Exclude<CreateVisualPayload, { kind: "drawing" | "connector" }>;

/** Payload accepted by `edgeless.visual.update`. */
export interface UpdateVisualPayload {
  readonly id: string;
  readonly patch: Partial<Omit<EdgelessVisual, "id" | "kind">>;
}

export type EdgelessAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type EdgelessReorder = "front" | "forward" | "backward" | "back";

/** Placeable kinds activated from the create toolbar (canvas rubber-band / click). */
export type EdgelessPlaceKind = "rectangle" | "ellipse" | "text" | "sticker";

export interface EdgelessVisualCommandMap {
  "edgeless.visual.create": { payload: CreateVisualPayload; result: EditorElementNode };
  "edgeless.visual.update": { payload: UpdateVisualPayload; result: EditorElementNode };
  "edgeless.visual.duplicate": { payload: undefined; result: EditorElementNode[] };
  "edgeless.visual.delete": { payload: undefined; result: void };
  "edgeless.selection.get": {
    payload: undefined;
    result: { active: boolean; items: readonly EdgelessSelectionRef[] };
  };
  "edgeless.selection.set": {
    payload: readonly EdgelessSelectionRef[] | { items: readonly EdgelessSelectionRef[] };
    result: void;
  };
  "edgeless.selection.clear": { payload: undefined; result: void };
  "edgeless.selection.move": { payload: { dx: number; dy: number }; result: void };
  "edgeless.selection.resize": { payload: { width: number; height: number }; result: void };
  "edgeless.selection.group": { payload: undefined; result: EditorElementNode };
  "edgeless.selection.ungroup": { payload: undefined; result: void };
  "edgeless.selection.align": {
    payload: EdgelessAlignment | { alignment: EdgelessAlignment };
    result: void;
  };
  "edgeless.selection.distribute": {
    payload: "horizontal" | "vertical" | { axis: "horizontal" | "vertical" };
    result: void;
  };
  "edgeless.selection.reorder": {
    payload: EdgelessReorder | { direction: EdgelessReorder };
    result: void;
  };
  "edgeless.tool.set": { payload: string; result: void };
}

export type VisualCommandPayload<Name extends keyof EdgelessVisualCommandMap> =
  EdgelessVisualCommandMap[Name]["payload"];

export type PayloadForKind<Payload, Kind> = Payload extends { kind: infer Kinds }
  ? Kind extends Kinds
    ? Omit<Payload, "kind">
    : never
  : never;

export type VisualPayload<Kind extends CreateVisualPayload["kind"]> = PayloadForKind<
  CreateVisualPayload,
  Kind
>;
