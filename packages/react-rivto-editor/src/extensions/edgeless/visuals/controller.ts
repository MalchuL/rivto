import {
  RIVTO_CLIPBOARD_MIME,
  type ClipboardBundle,
  type EditorBlock,
  type EditorBlockInput,
  type EditorElement,
} from "@chulane/rivto";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers";
import type { ReactEditor } from "../../../types";
import { blockIdsOf, blockRangeProps, insertBlockElementSeparator } from "../../../surfaces/edgeless/block-elements";
import { getEdgelessRuntime, type EdgelessSelectionRef } from "../edgeless-runtime";
import type {
  ConnectorEndpoint,
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessPlaceKind,
  EdgelessReorder,
  EdgelessVisual,
  EdgelessVisualsOptions,
  EdgelessVisualTool,
  PresetPayload,
  ToolCategory,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "./types";
import { DEFAULT_STICKERS } from "./presets";
import { connectorFrame, endpointPoint, unionFrames } from "./utils/geometry";
import { DEFAULT_PLACE_SIZE } from "./utils/creation-geometry";

const DEFAULT_FRAME: VisualFrame = { x: 120, y: 120, width: 160, height: 120 };
const VISUAL_TYPES = new Set(["sticker", "drawing", "rectangle", "ellipse", "text", "connector"]);
const copy = <Value>(value: Value): Value => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isHorizontalAlign = (value: unknown): value is "left" | "center" | "right" => value === "left" || value === "center" || value === "right";
const isVerticalAlign = (value: unknown): value is "top" | "middle" | "bottom" => value === "top" || value === "middle" || value === "bottom";
const isConnectorLineStyle = (value: unknown): value is "solid" | "dashed" | "dashed-animated" => (
  value === "solid" || value === "dashed" || value === "dashed-animated"
);
const isConnectorTextRotation = (
  value: unknown,
): value is "horizontal" | "90" | "180" | "270" | "along" => (
  value === "horizontal" || value === "90" || value === "180" || value === "270" || value === "along"
);

const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
const drawingDefaults = {
  pencil: { stroke: "#3f3f46", strokeWidth: 2, opacity: .68 },
  pen: { stroke: "#18181b", strokeWidth: 3, opacity: 1 },
  marker: { stroke: "#facc15", strokeWidth: 16, opacity: .34 },
} as const;

/** Owns React-specific element schemas, canvas commands, grouping, and clipboard behavior. */
export class EdgelessVisualController {
  private readonly selection;
  private readonly registrations: Array<{ dispose(): void }> = [];
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeDocument: () => void;
  private reconciling = false;
  private revision = 0;
  private readonly propertyPreview = new Map<string, Record<string, unknown>>();
  private currentTool: EdgelessVisualTool = { tool: "select" };
  private placeSize: Pick<VisualFrame, "width" | "height"> = { ...DEFAULT_PLACE_SIZE };
  private readonly defaults = {
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

  /** @param reactEditor - Owning React editor with first-class element storage. */
  constructor(readonly reactEditor: ReactEditor, readonly options: EdgelessVisualsOptions = {}) {
    this.selection = getEdgelessRuntime(reactEditor);
    this.registerCommands();
    this.registerClipboard();
    this.registerToolSelectShortcut();
    this.unsubscribeDocument = reactEditor.editor.document.subscribe(() => {
      if (this.reconciling) return;
      this.reconciling = true;
      try { this.normalizeGroups(); this.normalizeConnectors(); } finally { this.reconciling = false; }
      this.emit();
    });
  }

  private emit(): void {
    this.revision += 1;
    [...this.listeners].forEach((listener) => listener());
  }

  /** Snapshot token for React external-store subscriptions. */
  getRevision(): number { return this.revision; }

  /** @returns Detached visual views backed by first-class elements. */
  getVisuals(): EdgelessVisual[] {
    return this.reactEditor.editor.elements.getElements().flatMap((element) => {
      if (!VISUAL_TYPES.has(element.type)) return [];
      if (element.type === "sticker" && typeof element.props.text !== "string") return [];
      const preview = this.propertyPreview.get(element.id);
      const props = { ...element.props, ...preview };
      // Older documents may lack label fields on shapes/connectors; fill session defaults.
      if (element.type === "rectangle" || element.type === "ellipse") {
        Object.assign(props, {
          text: typeof props.text === "string" ? props.text : this.defaults.shape.text,
          color: typeof props.color === "string" ? props.color : this.defaults.shape.color,
          fontFamily: typeof props.fontFamily === "string" ? props.fontFamily : this.defaults.shape.fontFamily,
          fontSize: typeof props.fontSize === "number" ? props.fontSize : this.defaults.shape.fontSize,
          align: isHorizontalAlign(props.align) ? props.align : this.defaults.shape.align,
          verticalAlign: isVerticalAlign(props.verticalAlign) ? props.verticalAlign : this.defaults.shape.verticalAlign,
          filled: typeof props.filled === "boolean" ? props.filled : this.defaults.shape.filled,
          stroked: typeof props.stroked === "boolean" ? props.stroked : this.defaults.shape.stroked,
        });
      } else if (element.type === "connector") {
        Object.assign(props, {
          text: typeof props.text === "string" ? props.text : this.defaults.connector.text,
          color: typeof props.color === "string" ? props.color : this.defaults.connector.color,
          fontFamily: typeof props.fontFamily === "string" ? props.fontFamily : this.defaults.connector.fontFamily,
          fontSize: typeof props.fontSize === "number" ? props.fontSize : this.defaults.connector.fontSize,
          align: isHorizontalAlign(props.align) ? props.align : this.defaults.connector.align,
          verticalAlign: isVerticalAlign(props.verticalAlign) ? props.verticalAlign : this.defaults.connector.verticalAlign,
          lineStyle: isConnectorLineStyle(props.lineStyle) ? props.lineStyle : this.defaults.connector.lineStyle,
          textRotation: isConnectorTextRotation(props.textRotation)
            ? props.textRotation
            : this.defaults.connector.textRotation,
        });
      } else if (element.type === "text") {
        Object.assign(props, {
          align: isHorizontalAlign(props.align) ? props.align : this.defaults.text.align,
          verticalAlign: isVerticalAlign(props.verticalAlign) ? props.verticalAlign : this.defaults.text.verticalAlign,
        });
      } else if (element.type === "sticker") {
        Object.assign(props, {
          align: isHorizontalAlign(props.align) ? props.align : this.defaults.sticker.align,
          verticalAlign: isVerticalAlign(props.verticalAlign) ? props.verticalAlign : this.defaults.sticker.verticalAlign,
        });
      }
      // Shallow frame/props copies keep render hot paths off structuredClone while
      // still preventing callers from mutating live element identity fields.
      return [{ id: element.id, kind: element.type, frame: { ...element.frame }, zIndex: element.zIndex, ...props } as EdgelessVisual];
    });
  }

  /** Live property preview that does not create an undo step. */
  previewProperties(ids: readonly string[], patch: Record<string, unknown>): void {
    ids.forEach((id) => {
      this.propertyPreview.set(id, { ...this.propertyPreview.get(id), ...copy(patch) });
    });
    this.emit();
  }

  /** Commits the live property preview as one undoable transaction. */
  commitPropertyPreview(): void {
    const entries = [...this.propertyPreview.entries()];
    this.propertyPreview.clear();
    if (!entries.length) {
      this.emit();
      return;
    }
    this.reactEditor.editor.batchUpdates(() => {
      entries.forEach(([id, patch]) => this.update({ id, patch: patch as UpdateVisualPayload["patch"] }));
    });
    this.emit();
  }

  /** Drops an uncommitted property preview. */
  discardPropertyPreview(): void {
    if (!this.propertyPreview.size) return;
    this.propertyPreview.clear();
    this.emit();
  }

  /** True while property gestures have uncommitted preview values. */
  hasPropertyPreview(): boolean { return this.propertyPreview.size > 0; }

  /** @returns Detached logical groups backed by `group` elements. */
  getGroups(): VisualGroup[] {
    return this.reactEditor.editor.elements.getElements().flatMap((element) => {
      if (element.type !== "group") return [];
      const children = Array.isArray(element.props.children) ? element.props.children.filter((id): id is string => typeof id === "string") : [];
      return [{ id: element.id, title: typeof element.props.title === "string" ? element.props.title : "Group", children }];
    });
  }

  /** @param item - Element ID. @returns Derived outer geometry. */
  getBounds(item: EdgelessSelectionRef): VisualFrame | undefined { return this.bounds(item); }
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
  /** @param listener - Tool-state callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  /** Releases commands and local listeners without deleting persisted elements. */
  destroy(): void {
    this.unsubscribeDocument();
    this.registrations.reverse().forEach((registration) => registration.dispose());
    this.listeners.clear();
  }

  /** Creates one validated visual element and selects it. */
  create(payload: CreateVisualPayload): string {
    if (!payload || !VISUAL_TYPES.has(payload.kind)) throw new Error("Unsupported edgeless visual kind");
    let frame = this.frame({ ...DEFAULT_FRAME, ...payload.frame });
    const zIndex = Math.max(0, ...this.reactEditor.editor.elements.getElements().map((element) => element.zIndex)) + 1;
    let props: Record<string, unknown>;
    if (payload.kind === "sticker") {
      props = { ...this.defaults.sticker, text: payload.text ?? "Sticky note", fill: payload.fill ?? this.defaults.sticker.fill, color: payload.color ?? this.defaults.sticker.color, fontFamily: payload.fontFamily ?? this.defaults.sticker.fontFamily, fontSize: payload.fontSize ?? this.defaults.sticker.fontSize, align: payload.align ?? this.defaults.sticker.align, verticalAlign: payload.verticalAlign ?? this.defaults.sticker.verticalAlign };
    } else if (payload.kind === "drawing") {
      if (!Array.isArray(payload.points) || payload.points.length < 2) throw new Error("Drawing requires at least two points");
      const brush = payload.brush ?? this.defaults.drawing.brush;
      const preset = brush === this.defaults.drawing.brush ? this.defaults.drawing : drawingDefaults[brush];
      props = { points: copy(payload.points), brush, stroke: payload.stroke ?? preset.stroke, strokeWidth: payload.strokeWidth ?? preset.strokeWidth, opacity: payload.opacity ?? preset.opacity };
    } else if (payload.kind === "connector") {
      const source = this.endpoint(payload.source);
      const target = this.endpoint(payload.target);
      const sourcePoint = this.resolveEndpoint(source);
      const targetPoint = this.resolveEndpoint(target);
      const route = payload.route ?? this.defaults.connector.route;
      frame = connectorFrame(
        sourcePoint,
        targetPoint,
        source.anchor,
        target.anchor,
        route,
        source.elementId ? this.bounds(source.elementId) : undefined,
        target.elementId ? this.bounds(target.elementId) : undefined,
      );
      props = {
        ...this.defaults.connector,
        source,
        target,
        route,
        stroke: payload.stroke ?? this.defaults.connector.stroke,
        strokeWidth: payload.strokeWidth ?? this.defaults.connector.strokeWidth,
        opacity: payload.opacity ?? this.defaults.connector.opacity,
        lineStyle: payload.lineStyle ?? this.defaults.connector.lineStyle,
        startStyle: payload.startStyle ?? this.defaults.connector.startStyle,
        endStyle: payload.endStyle ?? this.defaults.connector.endStyle,
        text: payload.text ?? this.defaults.connector.text,
        textRotation: payload.textRotation ?? this.defaults.connector.textRotation,
        color: payload.color ?? this.defaults.connector.color,
        fontFamily: payload.fontFamily ?? this.defaults.connector.fontFamily,
        fontSize: payload.fontSize ?? this.defaults.connector.fontSize,
        align: payload.align ?? this.defaults.connector.align,
        verticalAlign: payload.verticalAlign ?? this.defaults.connector.verticalAlign,
      };
    } else if (payload.kind === "text") {
      props = { ...this.defaults.text, text: payload.text ?? "Text", color: payload.color ?? this.defaults.text.color, fontFamily: payload.fontFamily ?? this.defaults.text.fontFamily, fontSize: payload.fontSize ?? this.defaults.text.fontSize, align: payload.align ?? this.defaults.text.align, verticalAlign: payload.verticalAlign ?? this.defaults.text.verticalAlign };
    } else {
      props = {
        fill: payload.fill ?? this.defaults.shape.fill,
        stroke: payload.stroke ?? this.defaults.shape.stroke,
        strokeWidth: payload.strokeWidth ?? this.defaults.shape.strokeWidth,
        filled: payload.filled ?? this.defaults.shape.filled,
        stroked: payload.stroked ?? this.defaults.shape.stroked,
        text: payload.text ?? this.defaults.shape.text,
        color: payload.color ?? this.defaults.shape.color,
        fontFamily: payload.fontFamily ?? this.defaults.shape.fontFamily,
        fontSize: payload.fontSize ?? this.defaults.shape.fontSize,
        align: payload.align ?? this.defaults.shape.align,
        verticalAlign: payload.verticalAlign ?? this.defaults.shape.verticalAlign,
      };
    }
    const id = this.reactEditor.editor.elements.insertElement({ type: payload.kind, frame, zIndex, props });
    this.selection.set([id]);
    return id;
  }

  /** Patches one visual while keeping identity and type immutable. */
  update({ id, patch }: UpdateVisualPayload): void {
    const current = this.visual(id);
    if (!current) throw new Error(`Edgeless visual ${id} not found`);
    const safe = copy(patch) as Record<string, unknown>;
    delete safe.id;
    delete safe.kind;
    const framePatch = isRecord(safe.frame) ? safe.frame as Partial<VisualFrame> : undefined;
    delete safe.frame;
    delete safe.zIndex;
    this.reactEditor.editor.elements.updateElement(id, {
      frame: framePatch,
      props: safe,
    });
    this.remember(current.kind, safe);
  }

  /** Applies one property patch to an exact-type selection in one undo step. */
  updateMany(ids: readonly string[], patch: Record<string, unknown>): void {
    const visuals = ids.map((id) => this.visual(id));
    if (!visuals.length || visuals.some((visual) => !visual || visual.kind !== visuals[0]!.kind)) throw new Error("Shared properties require one visual type");
    this.reactEditor.editor.batchUpdates(() => ids.forEach((id) => this.update({ id, patch: patch as UpdateVisualPayload["patch"] })));
  }

  /** Moves the complete active selection by a canvas delta. */
  move(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Move delta must be finite");
    this.translate(this.selection.get().items, dx, dy);
  }

  /** Scales the active selection to an exact outer size. */
  resize(width: number, height: number): void {
    const items = this.selection.get().items;
    const bounds = unionFrames(items.flatMap((id) => this.bounds(id) ?? []));
    if (!bounds || width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return;
    this.reactEditor.editor.batchUpdates(() => this.leaves(items).forEach((id) => {
      const frame = this.bounds(id);
      if (!frame) return;
      this.setFrame(id, {
        x: bounds.x + (frame.x - bounds.x) * width / bounds.width,
        y: bounds.y + (frame.y - bounds.y) * height / bounds.height,
        width: frame.width * width / bounds.width,
        height: frame.height * height / bounds.height,
      });
    }));
  }

  /** Creates one nested-capable group from same-parent selected elements. */
  group(): string {
    const items = [...this.selection.get().items];
    if (items.length < 2) throw new Error("Grouping requires at least two objects");
    const parents = new Set(items.map((id) => this.parentId(id)));
    if (parents.size !== 1) throw new Error("Grouped objects must share one parent");
    const bounds = unionFrames(items.flatMap((id) => this.bounds(id) ?? [])) ?? DEFAULT_FRAME;
    const parentId = [...parents][0];
    // Batch insert + parent rewrite so normalizeGroups never sees a child claimed by
    // both the old parent and the new nested group in the same pass.
    const id = this.reactEditor.editor.batchUpdates(() => {
      const created = this.reactEditor.editor.elements.insertElement({
        type: "group",
        frame: bounds,
        zIndex: Math.max(0, ...items.map((item) => this.element(item)?.zIndex ?? 0)),
        props: { title: `Group ${this.getGroups().length + 1}`, children: items },
      });
      if (parentId) {
        const parent = this.groupRecord(parentId)!;
        const children = parent.children.map((child) => items.includes(child) ? created : child).filter((child, index, all) => all.indexOf(child) === index);
        this.reactEditor.editor.elements.updateElement(parentId, { props: { children } });
      }
      return created;
    });
    this.selection.set([id]);
    return id;
  }

  /** Replaces selected groups with their children and removes their records. */
  ungroup(): void {
    const selected = this.selection.get().items.filter((id) => this.element(id)?.type === "group");
    const children: string[] = [];
    this.reactEditor.editor.batchUpdates(() => selected.forEach((id) => {
      const group = this.groupRecord(id);
      if (!group) return;
      children.push(...group.children);
      const parentId = this.parentId(id);
      if (parentId) {
        const parent = this.groupRecord(parentId)!;
        this.reactEditor.editor.elements.updateElement(parentId, { props: { children: parent.children.flatMap((child) => child === id ? group.children : [child]) } });
      }
      this.reactEditor.editor.elements.removeElement(id);
    }));
    this.selection.set(children);
  }

  /** Aligns selected top-level elements without changing sizes. */
  align(mode: EdgelessAlignment): void {
    const entries = this.selection.get().items.flatMap((id) => { const bounds = this.bounds(id); return bounds ? [{ id, bounds }] : []; });
    const outer = unionFrames(entries.map(({ bounds }) => bounds));
    if (!outer || entries.length < 2) return;
    this.reactEditor.editor.batchUpdates(() => entries.forEach(({ id, bounds }) => {
      const dx = mode === "left" ? outer.x - bounds.x : mode === "center" ? outer.x + outer.width / 2 - bounds.width / 2 - bounds.x : mode === "right" ? outer.x + outer.width - bounds.width - bounds.x : 0;
      const dy = mode === "top" ? outer.y - bounds.y : mode === "middle" ? outer.y + outer.height / 2 - bounds.height / 2 - bounds.y : mode === "bottom" ? outer.y + outer.height - bounds.height - bounds.y : 0;
      if (dx || dy) this.translate([id], dx, dy);
    }));
  }

  /** Distributes three or more selected elements across their current outer span. */
  distribute(axis: "horizontal" | "vertical"): void {
    const entries = this.selection.get().items.flatMap((id) => { const bounds = this.bounds(id); return bounds ? [{ id, bounds }] : []; })
      .sort((a, b) => axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y);
    if (entries.length < 3) return;
    const first = entries[0]!.bounds;
    const last = entries.at(-1)!.bounds;
    const occupied = entries.reduce((sum, entry) => sum + (axis === "horizontal" ? entry.bounds.width : entry.bounds.height), 0);
    const span = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
    const gap = (span - occupied) / (entries.length - 1);
    let cursor = axis === "horizontal" ? first.x : first.y;
    this.reactEditor.editor.batchUpdates(() => entries.forEach(({ id, bounds }) => {
      const delta = cursor - (axis === "horizontal" ? bounds.x : bounds.y);
      if (delta) this.translate([id], axis === "horizontal" ? delta : 0, axis === "vertical" ? delta : 0);
      cursor += (axis === "horizontal" ? bounds.width : bounds.height) + gap;
    }));
  }

  /** Reorders selected leaves in the shared element layer. */
  reorder(direction: EdgelessReorder): void {
    const selected = new Set(this.leaves(this.selection.get().items));
    const layers = this.reactEditor.editor.elements.getElements().filter((element) => element.type !== "group").sort((a, b) => a.zIndex - b.zIndex).map((element) => element.id);
    const moving = layers.filter((id) => selected.has(id));
    const next = layers.filter((id) => !selected.has(id));
    if (direction === "front") next.push(...moving);
    else if (direction === "back") next.unshift(...moving);
    else moving.forEach((id) => {
      const old = layers.indexOf(id);
      const base = next.filter((candidate) => layers.indexOf(candidate) < old).length;
      next.splice(direction === "forward" ? Math.min(next.length, base + 1) : Math.max(0, base - 1), 0, id);
    });
    this.reactEditor.editor.elements.updateElements(next.map((id, zIndex) => ({ id, patch: { zIndex } })));
  }

  /** Structurally deletes selected elements and block trees represented by block elements. */
  deleteSelection(): void {
    this.deleteItems(this.selection.get().items);
    this.selection.clear();
  }

  /** Deletes arbitrary top-level canvas targets, expanding groups and block cards. */
  deleteItems(items: readonly string[]): void {
    const selected = [...items];
    const leaves = this.leaves(selected);
    this.reactEditor.editor.batchUpdates(() => {
      leaves.forEach((id) => {
        const element = this.element(id);
        if (element?.type === "block") blockIdsOf(element, this.reactEditor.editor.blocks.getRootIds()).forEach((blockId) => this.reactEditor.editor.blocks.removeBlock(blockId));
      });
      this.reactEditor.editor.elements.removeElements([...new Set([...leaves, ...selected.filter((id) => this.element(id)?.type === "group")])]);
      this.normalizeGroups();
    });
  }

  /** @returns Leaf IDs represented by an element or nested group selection. */
  getLeaves(items: readonly string[]): string[] { return this.leaves(items); }
  /** @returns Direct logical group containing an element, if any. */
  getParentId(id: string): string | undefined { return this.parentId(id); }

  /** @returns Detached active canvas selection. */
  getSelection() { return this.selection.get(); }

  private registerCommands(): void {
    const register = (name: string, handler: (payload: any) => unknown) => this.registrations.push(this.reactEditor.editor.register(name, handler));
    register("edgeless.visual.create", (value) => this.create(value as CreateVisualPayload));
    register("edgeless.visual.update", (value) => this.update(value as UpdateVisualPayload));
    register("edgeless.visual.duplicate", () => this.duplicateSelection());
    register("edgeless.visual.delete", () => this.deleteSelection());
    register("edgeless.selection.get", () => this.getSelection());
    register("edgeless.selection.set", (value) => this.select(value?.items ?? value));
    register("edgeless.selection.clear", () => this.clearSelection());
    register("edgeless.selection.move", (value) => this.move(Number(value?.dx), Number(value?.dy)));
    register("edgeless.selection.resize", (value) => this.resize(Number(value?.width), Number(value?.height)));
    register("edgeless.selection.group", () => this.group());
    register("edgeless.selection.ungroup", () => this.ungroup());
    register("edgeless.selection.align", (value) => { const mode = (value?.alignment ?? value) as EdgelessAlignment; if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Unsupported alignment"); this.align(mode); });
    register("edgeless.selection.distribute", (value) => { const axis = value?.axis ?? value; if (axis !== "horizontal" && axis !== "vertical") throw new Error("Unsupported distribution axis"); this.distribute(axis); });
    register("edgeless.selection.reorder", (value) => { const direction = (value?.direction ?? value) as EdgelessReorder; if (!["front", "forward", "backward", "back"].includes(direction)) throw new Error("Unsupported reorder direction"); this.reorder(direction); });
    register("edgeless.tool.set", (value) => this.setTool(value as EdgelessVisualTool | "select"));
  }

  private registerToolSelectShortcut(): void {
    const dispose = this.reactEditor.keyboard.register({
      id: KEYBOARD_BINDING_IDS.edgelessToolSelect,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessToolSelect],
      mode: "edgeless",
      priority: 20,
      when: ({ root }) => !root.dataset.transforming && this.currentTool.tool !== "select",
    }, () => {
      this.setTool("select");
      return true;
    });
    this.registrations.push({ dispose });
  }

  private registerClipboard(): void {
    const write = (event: ClipboardEvent, cut: boolean): boolean => {
      const snapshot = this.selection.get();
      if (!snapshot.active || !snapshot.items.length) return false;
      const bundle = this.createClipboardBundle(snapshot.items);
      const text = this.clipboardText(bundle);
      event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(bundle));
      event.clipboardData?.setData("text/plain", text);
      event.clipboardData?.setData("text/html", `<p>${this.escapeHtml(text).replace(/\n/g, "<br>")}</p>`);
      event.clipboardData?.setData("text/markdown", text);
      if (cut) this.deleteSelection();
      return true;
    };
    this.reactEditor.events.register({ id: "edgeless.visuals.copy", type: "copy", capture: true, mode: "edgeless" }, ({ raw }) => write(raw, false));
    this.reactEditor.events.register({ id: "edgeless.visuals.cut", type: "cut", capture: true, mode: "edgeless" }, ({ raw }) => write(raw, true));
    this.reactEditor.events.register({ id: "edgeless.visuals.paste", type: "paste", capture: true, mode: "edgeless" }, ({ raw }) => {
      const structured = raw.clipboardData?.getData(RIVTO_CLIPBOARD_MIME);
      if (!structured) return false;
      const bundle = JSON.parse(structured) as ClipboardBundle;
      if (bundle.version !== 4 || !bundle.elements?.length) return false;
      this.pasteClipboardBundle(bundle);
      return true;
    });
  }

  private createClipboardBundle(items: readonly string[]): ClipboardBundle {
    const leaves = this.leaves(items);
    const included = new Set(leaves);
    const collect = (id: string): void => { const group = this.groupRecord(id); if (!group || included.has(id)) return; included.add(id); group.children.forEach(collect); };
    items.forEach(collect);
    const rootIds = this.reactEditor.editor.blocks.getRootIds();
    const blockIds = new Set(leaves.flatMap((id) => { const element = this.element(id); return element?.type === "block" ? blockIdsOf(element, rootIds) : []; }));
    const blocks = this.reactEditor.editor.blocks.getBlocks().filter((block) => blockIds.has(block.id)).map(copy);
    const allBlockIds = new Set<string>();
    const visit = (block: EditorBlock): void => { allBlockIds.add(block.id); block.children.forEach(visit); };
    blocks.forEach(visit);
    return {
      version: 4,
      blocks,
      links: this.reactEditor.editor.links.getLinks().filter((link) => allBlockIds.has(link.from.blockId) && allBlockIds.has(link.to.blockId)),
      elements: this.reactEditor.editor.elements.getElements().filter((element) => included.has(element.id)).map(copy),
      selectedElementIds: [...items],
    };
  }

  private pasteClipboardBundle(bundle: ClipboardBundle): void {
    if (bundle.version !== 4 || !Array.isArray(bundle.blocks) || !Array.isArray(bundle.links) || !Array.isArray(bundle.elements)) throw new Error("Invalid edgeless clipboard payload");
    const blockMap = new Map<string, string>();
    const remapBlock = (block: EditorBlock): EditorBlockInput => { const id = crypto.randomUUID(); blockMap.set(block.id, id); return { ...copy(block), id, children: block.children.map(remapBlock) }; };
    const blocks = bundle.blocks.map(remapBlock);
    const elementMap = new Map(bundle.elements.map((element) => [element.id, crypto.randomUUID()]));
    const sourceRootIds = bundle.blocks.map((block) => block.id);
    const elements = bundle.elements.map((source): EditorElement => {
      const element = this.validateElement(source);
      const props = JSON.parse(JSON.stringify(element.props)) as Record<string, unknown>;
      if (element.type === "block") Object.assign(props, blockRangeProps(blockIdsOf(element, sourceRootIds).flatMap((id) => blockMap.get(id) ?? [])));
      if (element.type === "group") props.children = (Array.isArray(props.children) ? props.children : []).flatMap((id) => typeof id === "string" ? elementMap.get(id) ?? [] : []);
      if (element.type === "connector") {
        for (const key of ["source", "target"] as const) {
          const endpoint = props[key];
          if (!isRecord(endpoint)) continue;
          const mapped = typeof endpoint.elementId === "string" ? elementMap.get(endpoint.elementId) : undefined;
          props[key] = { ...endpoint, ...(mapped ? { elementId: mapped } : { elementId: undefined }), position: isRecord(endpoint.position) ? { x: Number(endpoint.position.x) + 24, y: Number(endpoint.position.y) + 24 } : endpoint.position };
        }
      }
      return { ...element, id: elementMap.get(element.id)!, frame: { ...element.frame, x: element.frame.x + 24, y: element.frame.y + 24 }, props };
    });
    const selected = (bundle.selectedElementIds ?? []).flatMap((id) => elementMap.get(id) ?? []);
    this.reactEditor.editor.batchUpdates(() => {
      let afterId = this.reactEditor.editor.blocks.getBlocks().at(-1)?.id;
      blocks.forEach((block) => { afterId = this.reactEditor.blocks.insertBlock(block, afterId); });
      const blockElements = elements.filter((element) => element.type === "block");
      const order = this.reactEditor.editor.blocks.getRootIds();
      const first = blockElements.flatMap((element) => blockIdsOf(element, order))[0];
      const before = first ? order[order.indexOf(first) - 1] : undefined;
      if (before) insertBlockElementSeparator(this.reactEditor, before);
      blockElements.slice(0, -1).forEach((element) => {
        const last = blockIdsOf(element, order).at(-1);
        if (last) insertBlockElementSeparator(this.reactEditor, last);
      });
      bundle.links.forEach((link) => { const from = blockMap.get(link.from.blockId); const to = blockMap.get(link.to.blockId); if (from && to) this.reactEditor.editor.links.createLink({ ...copy(link), id: crypto.randomUUID(), from: { ...link.from, blockId: from }, to: { ...link.to, blockId: to } }); });
      elements.forEach((element) => {
        try {
          this.reactEditor.editor.elements.insertElement(element);
        } catch (error) {
          throw new Error(`Failed to paste ${element.type} element ${element.id}`, { cause: error });
        }
      });
    });
    this.selection.set(selected.length ? selected : elements.map((element) => element.id));
  }

  private clipboardText(bundle: ClipboardBundle): string {
    const blockText = bundle.blocks.map((block) => block.content).filter(Boolean);
    const visualText = (bundle.elements ?? []).flatMap((element) => {
      if ((element.type === "text" || element.type === "sticker" || element.type === "rectangle" || element.type === "ellipse" || element.type === "connector") && typeof element.props.text === "string" && element.props.text) {
        return [element.props.text];
      }
      return [];
    });
    return [...blockText, ...visualText].filter(Boolean).join("\n");
  }

  private escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
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

  /** Replaces the active canvas selection with validated element references. */
  select(value: unknown): void {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !this.element(id))) throw new Error("Edgeless selection must contain existing element IDs");
    this.selection.set(value as string[]);
  }

  /** Clears the active canvas selection. */
  clearSelection(): void { this.selection.clear(); }

  /** Duplicates the active selection and returns the new top-level references. */
  duplicateSelection(): EdgelessSelectionRef[] { const items = this.selection.get().items; if (!items.length) return []; this.pasteClipboardBundle(this.createClipboardBundle(items)); return [...this.selection.get().items]; }

  private translate(items: readonly string[], dx: number, dy: number): void {
    this.reactEditor.editor.batchUpdates(() => this.leaves(items).forEach((id) => { const frame = this.bounds(id); if (frame) this.setFrame(id, { ...frame, x: frame.x + dx, y: frame.y + dy }); }));
  }

  private leaves(items: readonly string[], visited = new Set<string>()): string[] {
    return items.flatMap((id): string[] => { if (visited.has(id)) return []; visited.add(id); const group = this.groupRecord(id); return group ? this.leaves(group.children, visited) : this.element(id) ? [id] : []; });
  }

  private bounds(id: string): VisualFrame | undefined {
    const group = this.groupRecord(id);
    if (group) return unionFrames(group.children.flatMap((child) => this.bounds(child) ?? []));
    return this.element(id)?.frame;
  }

  private setFrame(id: string, frame: VisualFrame): void { if (this.element(id)?.type !== "group") this.reactEditor.editor.elements.updateElement(id, { frame: this.frame(frame) }); }
  private parentId(id: string): string | undefined { return this.getGroups().find((group) => group.children.includes(id))?.id; }

  private normalizeGroups(): void {
    const elements = new Set(this.reactEditor.editor.elements.getElements().map((element) => element.id));
    const groups = new Map(this.getGroups().map((group) => [group.id, group]));
    const parents = new Set<string>();
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => { if (from === target) return true; if (seen.has(from)) return false; seen.add(from); return groups.get(from)?.children.some((child) => groups.has(child) && reaches(child, target, seen)) ?? false; };
    groups.forEach((group) => {
      const local = new Set<string>();
      const children = group.children.filter((id) => elements.has(id) && id !== group.id && !local.has(id) && !parents.has(id) && !(groups.has(id) && reaches(id, group.id)) && (local.add(id), parents.add(id), true));
      if (!children.length) this.reactEditor.editor.elements.removeElement(group.id);
      else if (children.length !== group.children.length) this.reactEditor.editor.elements.updateElement(group.id, { props: { children } });
    });
  }

  private normalizeConnectors(): void {
    this.getVisuals().filter((visual): visual is Extract<EdgelessVisual, { kind: "connector" }> => visual.kind === "connector").forEach((connector) => {
      let missing = false;
      const resolve = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
        if (!endpoint.elementId) return endpoint;
        const frame = this.bounds(endpoint.elementId);
        if (!frame) { missing = true; return { ...endpoint, elementId: undefined }; }
        return { ...endpoint, position: endpointPoint(endpoint, frame) };
      };
      const source = resolve(connector.source);
      const target = resolve(connector.target);
      if (missing && this.options.orphanConnectors === "delete") { this.reactEditor.editor.elements.removeElement(connector.id); return; }
      const sourcePoint = this.resolveEndpoint(source);
      const targetPoint = this.resolveEndpoint(target);
      const frame = connectorFrame(
        sourcePoint,
        targetPoint,
        source.anchor,
        target.anchor,
        connector.route,
        source.elementId ? this.bounds(source.elementId) : undefined,
        target.elementId ? this.bounds(target.elementId) : undefined,
      );
      if (JSON.stringify(source) !== JSON.stringify(connector.source) || JSON.stringify(target) !== JSON.stringify(connector.target) || JSON.stringify(frame) !== JSON.stringify(connector.frame)) {
        this.reactEditor.editor.elements.updateElement(connector.id, { frame, props: { source, target } });
      }
    });
  }

  private endpoint(value: ConnectorEndpoint): ConnectorEndpoint {
    if (!value || !isRecord(value.anchor) || !isRecord(value.position)) throw new Error("Connector endpoint is required");
    const endpoint = copy(value);
    if (![endpoint.anchor.x, endpoint.anchor.y, endpoint.position.x, endpoint.position.y].every(Number.isFinite)) throw new Error("Connector endpoint requires finite coordinates");
    if (endpoint.elementId && !this.element(endpoint.elementId)) throw new Error(`Connector endpoint ${endpoint.elementId} not found`);
    return endpoint;
  }

  private resolveEndpoint(endpoint: ConnectorEndpoint): { x: number; y: number } { return endpointPoint(endpoint, endpoint.elementId ? this.bounds(endpoint.elementId) : undefined); }

  private remember(kind: EdgelessVisual["kind"], patch: Record<string, unknown>): void {
    const target = kind === "rectangle" || kind === "ellipse" ? this.defaults.shape : kind === "drawing" ? this.defaults.drawing : kind === "text" ? this.defaults.text : kind === "sticker" ? this.defaults.sticker : kind === "connector" ? this.defaults.connector : undefined;
    if (!target) return;
    Object.keys(target).forEach((key) => { if (key in patch) Object.assign(target, { [key]: copy(patch[key]) }); });
  }

  private element(id: string): EditorElement | undefined { return this.reactEditor.editor.elements.getElement(id); }
  private visual(id: string): EdgelessVisual | undefined { return this.getVisuals().find((visual) => visual.id === id); }
  private groupRecord(id: string): VisualGroup | undefined { return this.getGroups().find((group) => group.id === id); }

  private frame(value: VisualFrame): VisualFrame {
    if (![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) throw new Error("Visual frame requires finite positive geometry");
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }

  private validateElement(value: unknown): EditorElement {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string" || !isRecord(value.frame) || !isRecord(value.props) || typeof value.zIndex !== "number" || !Number.isFinite(value.zIndex)) throw new Error("Invalid edgeless clipboard element");
    this.frame(value.frame as unknown as VisualFrame);
    return copy(value) as unknown as EditorElement;
  }
}
