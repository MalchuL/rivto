import { RevisionStore } from "../../internal-store";
import type { EdgelessToolbarApi, EdgelessToolbarTool } from "../edgeless-toolbar/types";
import type { EdgelessPlaceKind, EdgelessVisualTool, PresetPayload, VisualFrame } from "../../elements/visuals/types";
import { DEFAULT_PLACE_SIZE } from "../../elements/visuals/utils/creation-geometry";
const copy = <Value>(value: Value): Value => structuredClone(value);
const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
export const drawingDefaults = {
  pencil: { stroke: "#3f3f46", strokeWidth: 2, opacity: .68 },
  pen: { stroke: "#18181b", strokeWidth: 3, opacity: 1 },
  marker: { stroke: "#facc15", strokeWidth: 16, opacity: .34 },
} as const;

/** Returns fresh built-in creation defaults, independent of mounted panels and session choices. */
export function createEdgelessDefaults() {
  return {
    shape: { fill: "#eeeaff", stroke: "#6c5ce7", strokeWidth: 2, filled: true, stroked: true, text: "", color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 16, align: "center" as const, verticalAlign: "middle" as const },
    text: { color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 24, align: "left" as const, verticalAlign: "top" as const },
    sticker: { fill: "#fff2a8", color: "#3f3515", fontFamily: DEFAULT_FONT, fontSize: 22, align: "left" as const, verticalAlign: "top" as const },
    drawing: { brush: "pen" as const, ...drawingDefaults.pen },
    connector: { route: "straight" as const, stroke: "#52525b", strokeWidth: 2, opacity: 1, lineStyle: "solid" as const, startStyle: "none" as const, endStyle: "arrow" as const, text: "", textRotation: "horizontal" as const, color: "#222222", fontFamily: DEFAULT_FONT, fontSize: 14, align: "center" as const, verticalAlign: "middle" as const },
  };
}

/**
 * Stores local creation defaults and the last tool selected in each category.
 *
 * The mounted edgeless representation retains this state until it unmounts. Each
 * operations instance owns separate state; values reset after a surface change
 * and are not persisted or recorded in undo.
 * It owns neither document data nor DOM resources. Emitted tool changes notify
 * subscribers synchronously; operation cleanup disconnects panel observers.
 */
export class EdgelessToolState {
  private readonly store = new RevisionStore();
  /** Observes local tool changes without an initial callback; returns an unsubscribe function. */
  readonly subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);
  private emit(): void { this.store.changed(); }

  private currentTool: EdgelessVisualTool = { tool: "select" };

  private placeSize?: Pick<VisualFrame, "width" | "height">;

  readonly defaults = createEdgelessDefaults();

  private readonly lastByGroup = new Map<string, string>();
  private activeEntryId?: string;

  /** @param toolbar - Shared tool definitions; this instance only owns panel-local choices. */
  constructor(private readonly toolbar: EdgelessToolbarApi) {}

  /** Removes stale remembered entries and resets a removed active tool without changing document content. */
  reconcileToolbar(): void {
    for (const [group, id] of this.lastByGroup) {
      if (!this.toolbar.getGroup(group) || this.toolbar.getTool(id)?.group !== group) this.lastByGroup.delete(group);
    }
    if (this.activeEntryId && !this.toolbar.getTool(this.activeEntryId)) this.setTool('select');
    this.activeEntryId = this.toolbar.getTools().find(item => item.isActive(this.currentTool))?.id;
  }

  /** @returns Current local creation tool. */
  getTool(): EdgelessVisualTool { return this.currentTool; }

  /** @returns Default size for the currently active place preset. */
  getPlaceSize(fallback: Pick<VisualFrame, "width" | "height"> = DEFAULT_PLACE_SIZE): Pick<VisualFrame, "width" | "height"> { return { ...(this.placeSize ?? fallback) }; }

  /** Remembers the final interactive drag size for the active place preset. */
  rememberPlaceSize(frame: VisualFrame): void {
    this.placeSize = { width: frame.width, height: frame.height };
  }

  /** @returns Detached session defaults used by creation menus. */
  getDefaults() { return copy(this.defaults); }

  /**
   * Resolves a group's remembered tool or its default without activating it.
   * @param groupId - Registered group identity.
   * @returns Current registration, or undefined for an absent or empty group.
   */
  getGroupTool(groupId: string): EdgelessToolbarTool | undefined {
    const group = this.toolbar.getGroup(groupId);
    if (!group) return undefined;
    const items = this.toolbar.getTools().filter(item => item.group === groupId);
    return items.find(item => item.id === this.lastByGroup.get(groupId))
      ?? items.find(item => item.id === group.defaultToolId)
      ?? items[0];
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
    const entry = this.toolbar.getTools().find(item => item.isActive(tool));
    this.activeEntryId = entry?.id;
    if (entry?.group) this.lastByGroup.set(entry.group, entry.id);
  }

  /** Activates one canvas interaction tool. */
  setTool(value: EdgelessVisualTool | "select"): void {
    const tool = value === "select" ? { tool: "select" } as const : value;
    if (!tool || !["select", "pan", "place", "element", "drawing", "eraser", "connector"].includes(tool.tool)) throw new Error("Unsupported edgeless visual tool");
    if (tool.tool === "place" && !(["rectangle", "ellipse", "text", "sticker"] as EdgelessPlaceKind[]).includes(tool.kind)) {
      throw new Error("Unsupported place kind");
    }
    if (tool.tool === "drawing" && !["pencil", "pen", "marker"].includes(tool.brush)) throw new Error("Unsupported drawing brush");
    if (tool.tool === "connector" && !["straight", "orthogonal", "curve"].includes(tool.route)) throw new Error("Unsupported connector route");
    if (JSON.stringify(tool) !== JSON.stringify(this.currentTool)) {
      this.placeSize = undefined;
    }
    this.currentTool = copy(tool);
    this.rememberTool(tool);
    this.emit();
  }

}
