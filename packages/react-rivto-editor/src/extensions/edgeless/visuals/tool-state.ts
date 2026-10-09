import type { EdgelessVisual, EdgelessVisualTool, EdgelessPlaceKind, PresetPayload, ToolCategory, VisualFrame } from "./types";
import { DEFAULT_STICKERS } from "./presets";
import { DEFAULT_PLACE_SIZE } from "./utils/creation-geometry";
const copy = <Value>(value: Value): Value => structuredClone(value);
const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
export const drawingDefaults = {
  pencil: { stroke: "#3f3f46", strokeWidth: 2, opacity: .68 },
  pen: { stroke: "#18181b", strokeWidth: 3, opacity: 1 },
  marker: { stroke: "#facc15", strokeWidth: 16, opacity: .34 },
} as const;

/** Stores local creation defaults and the last tool selected in each category. */
export class EdgelessToolState {
  /** @param emit - Notifies the owning controller after a visible tool change. */
  constructor(private readonly emit: () => void) {}

  private currentTool: EdgelessVisualTool = { tool: "select" };

  private placeSize: Pick<VisualFrame, "width" | "height"> = { ...DEFAULT_PLACE_SIZE };

  readonly defaults = {
    shape: { fill: "#eeeaff", stroke: "#6c5ce7", strokeWidth: 2, filled: true, stroked: true, text: "", color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 16, align: "center" as const, verticalAlign: "middle" as const },
    text: { color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 24, align: "left" as const, verticalAlign: "top" as const },
    sticker: { fill: "#fff2a8", color: "#3f3515", fontFamily: DEFAULT_FONT, fontSize: 22, align: "left" as const, verticalAlign: "top" as const },
    drawing: { brush: "pen" as const, ...drawingDefaults.pen },
    connector: { route: "straight" as const, stroke: "#52525b", strokeWidth: 2, opacity: 1, lineStyle: "solid" as const, startStyle: "none" as const, endStyle: "arrow" as const, text: "", textRotation: "horizontal" as const, color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 14, align: "center" as const, verticalAlign: "middle" as const },
  };

  private readonly lastByCategory: Record<ToolCategory, EdgelessVisualTool> = {
    shapes: { tool: "place", kind: "rectangle" },
    // Match session drawing defaults so first category activation does not swap brush presets.
    drawing: { tool: "drawing", brush: "pen" },
    text: { tool: "place", kind: "text" },
    stickers: {
      tool: "place",
      kind: "sticker",
      fill: DEFAULT_STICKERS[0]!.fill,
      color: DEFAULT_STICKERS[0]!.color,
      fontFamily: DEFAULT_STICKERS[0]!.fontFamily,
    },
    connectors: { tool: "connector", route: "straight" },
  };

  /** @returns Current local creation tool. */
  getTool(): EdgelessVisualTool { return this.currentTool; }

  /** @returns Default size for the currently active place preset. */
  getPlaceSize(): Pick<VisualFrame, "width" | "height"> { return { ...this.placeSize }; }

  /** Remembers the final interactive drag size for the active place preset. */
  rememberPlaceSize(frame: VisualFrame): void {
    this.placeSize = { width: frame.width, height: frame.height };
  }

  /** @returns Detached session defaults used by creation menus. */
  getDefaults() { return copy(this.defaults); }

  /** Last activated tool for a create-toolbar category (session memory). */
  getLastTool(category: ToolCategory): EdgelessVisualTool { return copy(this.lastByCategory[category]); }

  /** Activates the remembered (or first-default) tool for a category. */
  activateCategory(category: ToolCategory): void {
    const last = this.lastByCategory[category];
    if (last.tool === "drawing") {
      // Avoid clobbering session stroke defaults when the brush is already active.
      if (this.defaults.drawing.brush !== last.brush) this.setDrawingBrush(last.brush);
      else this.setTool(last);
      return;
    }
    this.setTool(last);
  }

  /** Enters place mode for a toolbar preset (click, not drag-drop). */
  setPlaceTool(payload: PresetPayload): void {
    this.setTool(this.placeToolFromPreset(payload));
  }

  /** Updates local creation defaults without mutating document content. */
  setCreationDefaults(kind: "shape" | "drawing" | "text" | "sticker" | "connector", patch: Record<string, unknown>): void {
    const target = this.defaults[kind];
    Object.keys(target).forEach((key) => { if (key in patch) Object.assign(target, { [key]: copy(patch[key]) }); });
    this.emit();
  }

  /** Selects a brush and its complete visual preset for subsequent strokes. */
  setDrawingBrush(brush: keyof typeof drawingDefaults): void {
    // Switching brushes adopts that brush preset; re-picking the same brush keeps session defaults.
    if (this.defaults.drawing.brush !== brush) {
      Object.assign(this.defaults.drawing, { brush, ...drawingDefaults[brush] });
    } else {
      this.defaults.drawing.brush = brush;
    }
    this.setTool({ tool: "drawing", brush });
  }

  private placeToolFromPreset(payload: PresetPayload): Extract<EdgelessVisualTool, { tool: "place" }> {
    if (payload.kind === "sticker") {
      return {
        tool: "place",
        kind: "sticker",
        fill: payload.fill,
        color: payload.color,
        fontFamily: payload.fontFamily,
      };
    }
    return { tool: "place", kind: payload.kind };
  }

  private rememberTool(tool: EdgelessVisualTool): void {
    if (tool.tool === "place") {
      if (tool.kind === "rectangle" || tool.kind === "ellipse") this.lastByCategory.shapes = copy(tool);
      else if (tool.kind === "text") this.lastByCategory.text = copy(tool);
      else if (tool.kind === "sticker") this.lastByCategory.stickers = copy(tool);
      return;
    }
    if (tool.tool === "drawing" || tool.tool === "eraser") this.lastByCategory.drawing = copy(tool);
    if (tool.tool === "connector") this.lastByCategory.connectors = copy(tool);
  }

  /** Activates one canvas interaction tool. */
  setTool(value: EdgelessVisualTool | "select"): void {
    const tool = value === "select" ? { tool: "select" } as const : value;
    if (!tool || !["select", "pan", "place", "drawing", "eraser", "connector"].includes(tool.tool)) throw new Error("Unsupported edgeless visual tool");
    if (tool.tool === "place" && !(["rectangle", "ellipse", "text", "sticker"] as EdgelessPlaceKind[]).includes(tool.kind)) {
      throw new Error("Unsupported place kind");
    }
    if (tool.tool === "drawing" && !["pencil", "pen", "marker"].includes(tool.brush)) throw new Error("Unsupported drawing brush");
    if (tool.tool === "connector" && !["straight", "orthogonal", "curve"].includes(tool.route)) throw new Error("Unsupported connector route");
    if (JSON.stringify(tool) !== JSON.stringify(this.currentTool)) {
      this.placeSize = { ...DEFAULT_PLACE_SIZE };
    }
    this.currentTool = copy(tool);
    this.rememberTool(tool);
    this.emit();
  }

  /** Remembers supported properties for subsequent objects without notifying subscribers. */
  remember(kind: EdgelessVisual["kind"], patch: Record<string, unknown>): void {
    const key = kind === "rectangle" || kind === "ellipse" ? "shape" : kind;
    const target = this.defaults[key];
    if (!target) return;
    Object.keys(target).forEach((key) => { if (key in patch) Object.assign(target, { [key]: copy(patch[key]) }); });
  }
}
