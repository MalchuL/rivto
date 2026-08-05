import type { EdgelessSelectionRef } from "../edgeless-runtime";
export type { EdgelessSelectionRef } from "../edgeless-runtime";

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

/** Image- or emoji-backed sticker. */
export interface StickerVisual extends VisualBase {
  readonly kind: "sticker";
  source: { type: "image"; src: string } | { type: "emoji"; value: string };
  alt: string;
}

/** Freehand stroke whose points are stored relative to its frame. */
export interface DrawingVisual extends VisualBase {
  readonly kind: "drawing";
  points: Array<{ x: number; y: number; pressure?: number }>;
  stroke: string;
  strokeWidth: number;
}

/** Rectangle or ellipse with simple fill and stroke styling. */
export interface ShapeVisual extends VisualBase {
  readonly kind: "rectangle" | "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/** Canvas text independent from document blocks. */
export interface TextVisual extends VisualBase {
  readonly kind: "text";
  text: string;
  color: string;
  fontSize: number;
  align: "left" | "center" | "right";
}

/** React visual view materialized from a first-class document element. */
export type EdgelessVisual = StickerVisual | DrawingVisual | ShapeVisual | TextVisual;

/** Persisted logical group element; children are first-class element IDs. */
export interface VisualGroup {
  readonly id: string;
  title: string;
  children: EdgelessSelectionRef[];
}

/** Sticker catalog entry offered by the optional visual toolbar. */
export interface EdgelessStickerOption {
  readonly id: string;
  readonly label: string;
  readonly source: StickerVisual["source"];
  readonly alt?: string;
}

/** Configuration accepted by {@link edgelessVisualsExtension}. */
export interface EdgelessVisualsOptions {
  readonly stickers?: readonly EdgelessStickerOption[];
  readonly toolbar?: boolean;
}

/** Payload accepted by `edgeless.visual.create`. */
export type CreateVisualPayload =
  | { kind: "sticker"; frame?: Partial<VisualFrame>; source: StickerVisual["source"]; alt?: string }
  | { kind: "drawing"; frame: VisualFrame; points: DrawingVisual["points"]; stroke?: string; strokeWidth?: number }
  | { kind: "rectangle" | "ellipse"; frame?: Partial<VisualFrame>; fill?: string; stroke?: string; strokeWidth?: number }
  | { kind: "text"; frame?: Partial<VisualFrame>; text?: string; color?: string; fontSize?: number; align?: TextVisual["align"] };

/** Payload accepted by `edgeless.visual.update`. */
export interface UpdateVisualPayload {
  readonly id: string;
  readonly patch: Partial<Omit<EdgelessVisual, "id" | "kind">>;
}

/** Alignment modes accepted by `edgeless.selection.align`. */
export type EdgelessAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Layer movement accepted by `edgeless.selection.reorder`. */
export type EdgelessReorder = "front" | "forward" | "backward" | "back";

/** Tool IDs accepted by `edgeless.tool.set`. */
export type EdgelessVisualTool = "select" | "drawing";

/** Typed documentation map for the string commands installed by the extension. */
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
  "edgeless.tool.set": { payload: EdgelessVisualTool | { tool: EdgelessVisualTool }; result: void };
}
