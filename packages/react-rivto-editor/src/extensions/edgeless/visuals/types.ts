import type { EdgelessSelectionRef } from "../edgeless-runtime";
export type { EdgelessSelectionRef } from "../edgeless-runtime";

/** Axis-aligned canvas geometry shared by every visual leaf. */
export interface VisualFrame { x: number; y: number; width: number; height: number }

interface VisualBase { readonly id: string; frame: VisualFrame; zIndex: number }

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

/** Horizontal placement of text inside a frame or label. */
export type TextHorizontalAlign = "left" | "center" | "right";
/** Vertical placement of text inside a frame or label. */
export type TextVerticalAlign = "top" | "middle" | "bottom";

/** Styled editable sticky note. */
export interface StickerVisual extends VisualBase {
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
export interface DrawingVisual extends VisualBase {
  readonly kind: "drawing";
  points: Array<{ x: number; y: number; pressure?: number }>;
  brush: EdgelessBrush;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** Rectangle or ellipse with fill, stroke, and optional centered label. */
export interface ShapeVisual extends VisualBase {
  readonly kind: "rectangle" | "ellipse";
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
export interface TextVisual extends VisualBase {
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
export type EdgelessVisual = StickerVisual | DrawingVisual | ShapeVisual | TextVisual | ConnectorVisual;

/** Persisted logical group element; children are first-class element IDs. */
export interface VisualGroup { readonly id: string; title: string; children: EdgelessSelectionRef[] }

/** Font offered by text and sticky-note property menus. */
export interface EdgelessFontOption { readonly label: string; readonly fontFamily: string }

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

/** Configuration accepted by {@link edgelessVisualsExtension}. */
export interface EdgelessVisualsOptions {
  readonly fonts?: readonly EdgelessFontOption[];
  readonly stickers?: readonly EdgelessStickerOption[];
  readonly orphanConnectors?: OrphanConnectorBehavior;
  readonly toolbar?: boolean;
}

/** Payload accepted by `edgeless.visual.create`. */
export type CreateVisualPayload =
  | { kind: "sticker"; frame?: Partial<VisualFrame>; text?: string; fill?: string; color?: string; fontFamily?: string; fontSize?: number; align?: TextHorizontalAlign; verticalAlign?: TextVerticalAlign }
  | { kind: "drawing"; frame: VisualFrame; points: DrawingVisual["points"]; brush?: EdgelessBrush; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: "connector"; frame?: Partial<VisualFrame>; source: ConnectorEndpoint; target: ConnectorEndpoint; route?: ConnectorRoute; stroke?: string; strokeWidth?: number; opacity?: number; lineStyle?: ConnectorLineStyle; startStyle?: ConnectorEndpointStyle; endStyle?: ConnectorEndpointStyle; text?: string; textRotation?: ConnectorTextRotation; color?: string; fontFamily?: string; fontSize?: number; align?: TextHorizontalAlign; verticalAlign?: TextVerticalAlign }
  | { kind: "rectangle" | "ellipse"; frame?: Partial<VisualFrame>; fill?: string; stroke?: string; strokeWidth?: number; filled?: boolean; stroked?: boolean; text?: string; color?: string; fontFamily?: string; fontSize?: number; align?: TextHorizontalAlign; verticalAlign?: TextVerticalAlign }
  | { kind: "text"; frame?: Partial<VisualFrame>; text?: string; color?: string; fontFamily?: string; fontSize?: number; align?: TextHorizontalAlign; verticalAlign?: TextVerticalAlign };

/** Click/drag presets from the create toolbar (not drawing or connector tools). */
export type PresetPayload = Exclude<CreateVisualPayload, { kind: "drawing" | "connector" }>;

/** Openable create-toolbar category. */
export type ToolCategory = "shapes" | "drawing" | "text" | "stickers" | "connectors";

/** Payload accepted by `edgeless.visual.update`. */
export interface UpdateVisualPayload { readonly id: string; readonly patch: Partial<Omit<EdgelessVisual, "id" | "kind">> }

export type EdgelessAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type EdgelessReorder = "front" | "forward" | "backward" | "back";

/** Placeable kinds activated from the create toolbar (canvas rubber-band / click). */
export type EdgelessPlaceKind = "rectangle" | "ellipse" | "text" | "sticker";

/** Local tool state; place tools create shapes/text/stickies on the canvas. */
export type EdgelessVisualTool =
  | { tool: "select" }
  | { tool: "pan" }
  | { tool: "place"; kind: EdgelessPlaceKind; fill?: string; color?: string; fontFamily?: string }
  | { tool: "drawing"; brush: EdgelessBrush }
  | { tool: "eraser" }
  | { tool: "connector"; route: ConnectorRoute };

export interface EdgelessVisualCommandMap {
  "edgeless.visual.create": { payload: CreateVisualPayload; result: string };
  "edgeless.visual.update": { payload: UpdateVisualPayload; result: void };
  "edgeless.visual.duplicate": { payload: undefined; result: EdgelessSelectionRef[] };
  "edgeless.visual.delete": { payload: undefined; result: void };
  "edgeless.selection.get": { payload: undefined; result: { active: boolean; items: readonly EdgelessSelectionRef[] } };
  "edgeless.selection.set": { payload: readonly EdgelessSelectionRef[] | { items: readonly EdgelessSelectionRef[] }; result: void };
  "edgeless.selection.clear": { payload: undefined; result: void };
  "edgeless.selection.move": { payload: { dx: number; dy: number }; result: void };
  "edgeless.selection.resize": { payload: { width: number; height: number }; result: void };
  "edgeless.selection.group": { payload: undefined; result: string };
  "edgeless.selection.ungroup": { payload: undefined; result: void };
  "edgeless.selection.align": { payload: EdgelessAlignment | { alignment: EdgelessAlignment }; result: void };
  "edgeless.selection.distribute": { payload: "horizontal" | "vertical" | { axis: "horizontal" | "vertical" }; result: void };
  "edgeless.selection.reorder": { payload: EdgelessReorder | { direction: EdgelessReorder }; result: void };
  "edgeless.tool.set": { payload: EdgelessVisualTool | "select"; result: void };
}
