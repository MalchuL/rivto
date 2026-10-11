import { ElementGeometry } from "../element-geometry";
import { drawingResizeProps } from "./utils/drawing-frame";
import { copyElementProps, restoreElementChildren } from "../../../elements/clipboard-element-props";
import {
  RIVTO_CLIPBOARD_MIME,
  validateClipboardBundle,
  type ClipboardBundle,
  type EditorElementNode,
} from "@chulane/rivto";
import type { EditorViewApi } from "../../../editor-view/types";
import type { EditorRuntime } from "../../../editor/editor-runtime";
import { blockIdsOf, blockRangeProps, insertBlockElementSeparator } from "../../../elements/block-element-projection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers";
import { isNonBlockEditableClipboardEvent } from "../../built-ins/clipboard/clipboard-target";
import { getEdgelessRuntime, type EdgelessSelectionRef } from "../../built-ins/selection/edgeless-runtime";
import { drawingDefaults, EdgelessToolState } from "./tool-state";
import type {
  ConnectorEndpoint,
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessReorder,
  EdgelessVisual,
  EdgelessVisualCommandMap,
  EdgelessVisualsOptions,
  EdgelessVisualTool,
  PresetPayload,
  ToolCategory,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "./types";
import { connectorFrame, endpointPoint, normalizeRotation, unionFrames } from "./utils/geometry";

const DEFAULT_FRAME: VisualFrame = { x: 120, y: 120, width: 160, height: 120 };
type VisualCommandPayload<Name extends keyof EdgelessVisualCommandMap> = EdgelessVisualCommandMap[Name]["payload"];
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

/** Owns React-specific element schemas, canvas commands, grouping, and clipboard behavior. */
export class EdgelessVisualController {
  /** Document managers used by both the installed controller and its view-bound operations. */
  get runtime(): EditorRuntime { return "runtime" in this.editor ? this.editor.runtime : this.editor; }
  private rootIds() { return "runtime" in this.editor ? this.editor.getRootBlockIds() : this.runtime.blocks.getRootIds(); }
  /** Element operations for the receiving canvas, or all elements during shared normalization. */
  get elements() { return "runtime" in this.editor ? this.editor.elements : this.runtime.elements; }

  private readonly commandHandlers = new Map<string, (controller: EdgelessVisualController, payload?: unknown) => unknown>();
  private readonly tools = new EdgelessToolState(() => this.emit());
  private get defaults() { return this.tools.defaults; }
  private readonly selection;
  private readonly registrations: Array<{ dispose(): void }> = [];
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeDocument: () => void;
  private reconciling = false;
  private revision = 0;
  private readonly propertyPreview = new Map<string, Record<string, unknown>>();

  /** @param editor - Owning React editor with first-class element storage. */
  constructor(readonly editor: EditorViewApi | EditorRuntime, readonly options: EdgelessVisualsOptions = {}) {
    this.selection = getEdgelessRuntime(editor);
    this.registrations.push({ dispose: this.registerCommands() });
    this.registerClipboard();
    this.registerToolSelectShortcut();
    this.unsubscribeDocument = this.runtime.subscribe(() => {
      if (this.reconciling) return;
      this.reconciling = true;
      try { this.normalizeConnectors(); } finally { this.reconciling = false; }
      this.emit();
    });
  }

  /**
   * Uses a view's document and selection while sharing this installed controller.
   * The API creates no commands, listeners, or acquisitions. Tool state and
   * revisions remain shared; model reads and writes use the supplied view API.
   * @param editorView - Native view's document-bound editor API.
   * @returns Controller API for renderers and retained handlers in that view.
   */
  getDocumentView(editorView: EditorViewApi): EdgelessVisualController {
    const selection = getEdgelessRuntime(editorView);
    return new Proxy(this, {
      get(target, key, receiver) {
        if (key === "editor") return editorView;
        if (key === "selection") return selection;
        return Reflect.get(target, key, receiver);
      },
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
    return this.elements.getElementNodes().flatMap((element) => {
      if (!VISUAL_TYPES.has(element.type)) return [];
      if (element.type === "sticker" && typeof element.props.text !== "string") return [];
      const preview = this.propertyPreview.get(element.id);
      const props = { ...element.props, ...preview };
      if (element.type !== "connector") props.rotation = normalizeRotation(typeof props.rotation === "number" ? props.rotation : 0);
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
    this.runtime.history.batchUpdates(() => {
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
    return this.elements.getElementNodes().flatMap((element) => {
      if (element.type !== "group") return [];
      const children = element.childIds;
      return [{ id: element.id, title: typeof element.props.title === "string" ? element.props.title : "Group", children }];
    });
  }

  /** @param item - Element ID. @returns Derived outer geometry. */
  getBounds(item: EdgelessSelectionRef): VisualFrame | undefined { return this.bounds(item); }
  /** @param item - Element ID. @returns Its frame before rotation; groups derive it from current descendants. */
  getFrame(item: EdgelessSelectionRef): VisualFrame | undefined { return this.geometry.frame(item); }
  /** @param item - Element ID. @returns Its normalized visual rotation. */
  getRotation(item: EdgelessSelectionRef): number { return this.rotation(item); }
  /** @param item - Element ID. @returns Its persisted stacking order. */
  getZIndex(item: EdgelessSelectionRef): number { return this.element(item)?.zIndex ?? 0; }
  /** @param item - Group ID. @returns A layer below every descendant but above older canvas content. */
  getGroupHitZIndex(item: EdgelessSelectionRef): number {
    return Math.min(...this.leaves([item]).map((id) => this.element(id)?.zIndex ?? 0), this.getZIndex(item)) - 1;
  }
  /** @returns Current local creation tool. */
  getTool(): EdgelessVisualTool { return this.tools.getTool(); }
  /** @returns Default size for the currently active place preset. */
  getPlaceSize(): Pick<VisualFrame, "width" | "height"> { return this.tools.getPlaceSize(); }
  /** Remembers the final interactive drag size for the active place preset. */
  rememberPlaceSize(frame: VisualFrame): void { return this.tools.rememberPlaceSize(frame); }
  /** @returns Detached session defaults used by creation menus. */
  getDefaults() { return this.tools.getDefaults(); }
  /** Last activated tool for a create-toolbar category (session memory). */
  getLastTool(category: ToolCategory): EdgelessVisualTool { return this.tools.getLastTool(category); }
  /** Activates the remembered (or first-default) tool for a category. */
  activateCategory(category: ToolCategory): void { return this.tools.activateCategory(category); }
  /** Enters place mode for a toolbar preset (click, not drag-drop). */
  setPlaceTool(payload: PresetPayload): void { return this.tools.setPlaceTool(payload); }
  /** Updates local creation defaults without mutating document content. */
  setCreationDefaults(kind: "shape" | "drawing" | "text" | "sticker" | "connector", patch: Record<string, unknown>): void { return this.tools.setCreationDefaults(kind, patch); }
  /** Selects a brush and its complete visual preset for subsequent strokes. */
  setDrawingBrush(brush: keyof typeof drawingDefaults): void { return this.tools.setDrawingBrush(brush); }
  /** @param listener - Tool-state callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  /** Releases commands and local listeners without deleting persisted elements. */
  destroy(): void {
    this.unsubscribeDocument();
    this.registrations.reverse().forEach((registration) => registration.dispose());
    this.listeners.clear();
  }

  /**
   * Creates one validated visual element and selects it.
   * @param payload - Visual kind and persisted values.
   * @returns Complete normalized created element.
   */
  create(payload: CreateVisualPayload): EditorElementNode {
    if (!payload || !VISUAL_TYPES.has(payload.kind)) throw new Error("Unsupported edgeless visual kind");
    let frame = this.frame({ ...DEFAULT_FRAME, ...payload.frame });
    const zIndex = Math.max(0, ...this.elements.getElementNodes().map((element) => element.zIndex)) + 1;
    let props: Record<string, unknown>;
    if (payload.kind === "sticker") {
      props = { ...this.defaults.sticker, rotation: normalizeRotation(payload.rotation ?? 0), text: payload.text ?? "Sticky note", fill: payload.fill ?? this.defaults.sticker.fill, color: payload.color ?? this.defaults.sticker.color, fontFamily: payload.fontFamily ?? this.defaults.sticker.fontFamily, fontSize: payload.fontSize ?? this.defaults.sticker.fontSize, align: payload.align ?? this.defaults.sticker.align, verticalAlign: payload.verticalAlign ?? this.defaults.sticker.verticalAlign };
    } else if (payload.kind === "drawing") {
      if (!Array.isArray(payload.points) || payload.points.length < 2) throw new Error("Drawing requires at least two points");
      const brush = payload.brush ?? this.defaults.drawing.brush;
      const preset = brush === this.defaults.drawing.brush ? this.defaults.drawing : drawingDefaults[brush];
      props = { rotation: normalizeRotation(payload.rotation ?? 0), points: copy(payload.points), brush, stroke: payload.stroke ?? preset.stroke, strokeWidth: payload.strokeWidth ?? preset.strokeWidth, opacity: payload.opacity ?? preset.opacity };
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
      props = { ...this.defaults.text, rotation: normalizeRotation(payload.rotation ?? 0), text: payload.text ?? "Text", color: payload.color ?? this.defaults.text.color, fontFamily: payload.fontFamily ?? this.defaults.text.fontFamily, fontSize: payload.fontSize ?? this.defaults.text.fontSize, align: payload.align ?? this.defaults.text.align, verticalAlign: payload.verticalAlign ?? this.defaults.text.verticalAlign };
    } else {
      props = {
        rotation: normalizeRotation(payload.rotation ?? 0),
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
    const element = this.elements.insertElement({ type: payload.kind, frame, zIndex, props });
    this.selection.set([element.id]);
    return this.elements.getElementNode(element.id)!;
  }

  /**
   * Patches one visual while keeping identity and type immutable.
   * @param payload - Element identity and mutable visual fields.
   * @returns Complete normalized updated element.
   */
  update({ id, patch }: UpdateVisualPayload): EditorElementNode {
    const current = this.visual(id);
    if (!current) throw new Error(`Edgeless visual ${id} not found`);
    const safe = copy(patch) as Record<string, unknown>;
    delete safe.id;
    delete safe.kind;
    if ("rotation" in safe) safe.rotation = normalizeRotation(typeof safe.rotation === "number" ? safe.rotation : 0);
    const framePatch = isRecord(safe.frame) ? safe.frame as Partial<VisualFrame> : undefined;
    delete safe.frame;
    delete safe.zIndex;
    const updated = this.elements.updateElement(id, {
      frame: framePatch,
      props: { ...drawingResizeProps(this.elements.getElementNode(id)!, framePatch ?? {}), ...safe },
    });
    this.remember(current.kind, safe);
    return updated;
  }

  /** Applies one property patch to an exact-type selection in one undo step. */
  updateMany(ids: readonly string[], patch: Record<string, unknown>): void {
    const visuals = ids.map((id) => this.visual(id));
    if (!visuals.length || visuals.some((visual) => !visual || visual.kind !== visuals[0]!.kind)) throw new Error("Shared properties require one visual type");
    this.runtime.history.batchUpdates(() => ids.forEach((id) => this.update({ id, patch: patch as UpdateVisualPayload["patch"] })));
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
    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    this.runtime.history.batchUpdates(() => this.leaves(items).forEach((id) => {
      const frame = this.element(id)?.frame;
      if (!frame) return;
      const center = {
        x: bounds.x + (frame.x + frame.width / 2 - bounds.x) * scaleX,
        y: bounds.y + (frame.y + frame.height / 2 - bounds.y) * scaleY,
      };
      const nextWidth = frame.width * scaleX;
      const nextHeight = frame.height * scaleY;
      this.setFrame(id, {
        x: center.x - nextWidth / 2,
        y: center.y - nextHeight / 2,
        width: nextWidth,
        height: nextHeight,
      });
    }));
  }

  /**
   * Creates an empty group element around the selected siblings and internal connectors.
   *
   * Children retain their IDs, original sibling order, and canvas-relative frames.
   * The parent occupies the first selected sibling's position. Its initial frame
   * covers the selection; displayed bounds are derived from the children afterward
   * in the group's props.rotation axes (zero when absent), without persisting
   * those derived dimensions or changing the angle when a child moves.
   * Group membership is owned by this extension; the model stores an ordinary parent.
   * All writes use the editor processing pipeline within one history transaction.
   *
   * @returns Detached flat parent record with its final ordered childIds.
   * @throws If fewer than two distinct existing elements are selected, parents
   * differ, or the new record fails processing or validation before insertion.
   */
  group(): EditorElementNode {
    const selected = [...this.selection.get().items];
    const internalConnectors = this.internalConnectorIds(selected);
    const items = [...new Set([...selected, ...internalConnectors])];
    if (items.some((id) => !this.elements.hasElement(id))) throw new Error("Grouped objects must exist");
    if (items.length < 2) throw new Error("Grouping requires at least two objects");
    const parents = new Set(items.map((id) => this.parentId(id)));
    if (parents.size !== 1) throw new Error("Grouped objects must share one parent");
    const bounds = unionFrames(items.flatMap((id) => this.bounds(id) ?? [])) ?? DEFAULT_FRAME;
    const parentId = this.parentId(items[0]!) ?? null;
    const parent = parentId ? this.element(parentId) : undefined;
    // A Panel exposes its root's children, but excludes the root element itself.
    const siblings = parent?.childIds ?? this.elements.getRootIds();
    const selectedIds = new Set(items);
    const ordered = siblings.filter((id) => selectedIds.has(id));
    const group = this.runtime.history.batchUpdates(() => {
      const group = this.elements.insertElement({
        type: "group", frame: bounds,
        zIndex: Math.max(0, ...items.map((item) => this.element(item)?.zIndex ?? 0)),
        props: { title: `Group ${this.getGroups().length + 1}` },
      });
      this.elements.moveElements([group.id], { parentId, beforeId: ordered[0] });
      this.elements.moveElements(ordered, { parentId: group.id });
      return this.elements.getElementNode(group.id)!;
    });
    this.selection.set([group.id]);
    return group;
  }

  /** Replaces selected groups with their children and removes their records. */
  ungroup(): void {
    const selected = this.selection.get().items.filter((id) => this.element(id)?.type === "group");
    const children: string[] = [];
    this.runtime.history.batchUpdates(() => selected.forEach((id) => {
      const group = this.groupRecord(id);
      if (!group) return;
      children.push(...group.children);
      this.elements.removeElementAndPromoteChildren(id);
    }));
    this.selection.set(children);
  }

  /** Aligns selected top-level elements without changing sizes. */
  align(mode: EdgelessAlignment): void {
    const entries = this.selection.get().items.flatMap((id) => { const bounds = this.bounds(id); return bounds ? [{ id, bounds }] : []; });
    const outer = unionFrames(entries.map(({ bounds }) => bounds));
    if (!outer || entries.length < 2) return;
    this.runtime.history.batchUpdates(() => entries.forEach(({ id, bounds }) => {
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
    this.runtime.history.batchUpdates(() => entries.forEach(({ id, bounds }) => {
      const delta = cursor - (axis === "horizontal" ? bounds.x : bounds.y);
      if (delta) this.translate([id], axis === "horizontal" ? delta : 0, axis === "vertical" ? delta : 0);
      cursor += (axis === "horizontal" ? bounds.width : bounds.height) + gap;
    }));
  }

  /** Reorders selected leaves in the shared element layer. */
  reorder(direction: EdgelessReorder): void {
    const items = this.selection.get().items;
    const selected = new Set([...this.leaves(items), ...this.internalConnectorIds(items)]);
    const layers = this.elements.getElementNodes().filter((element) => element.type !== "group").sort((a, b) => a.zIndex - b.zIndex).map((element) => element.id);
    const moving = layers.filter((id) => selected.has(id));
    const stationary = layers.filter((id) => !selected.has(id));
    const frontmost = Math.max(...moving.map((id) => layers.indexOf(id)));
    const current = stationary.filter((id) => layers.indexOf(id) < frontmost).length;
    const insertion = direction === "front" ? stationary.length
      : direction === "back" ? 0
        : direction === "forward" ? Math.min(stationary.length, current + 1)
          : Math.max(0, current - 1);
    const next = [...stationary];
    next.splice(insertion, 0, ...moving);
    this.elements.updateElements(next.map((id, zIndex) => ({ id, patch: { zIndex } })));
  }

  /**
   * Sets automatic content-height behavior on selected block cards.
   *
   * @param items - Selected element or group IDs; only direct block cards change.
   * @param enabled - Whether content measurement controls card height.
   */
  setBlockAutoHeight(items: readonly EdgelessSelectionRef[], enabled: boolean): void {
    const blocks = items.filter((id) => this.element(id)?.type === "block");
    if (!blocks.length) return;
    this.elements.updateElements(blocks.map((id) => ({ id, patch: { props: { autoHeight: enabled } } })));
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
    this.runtime.history.batchUpdates(() => {
      leaves.forEach((id) => {
        const element = this.element(id);
        if (element?.type === "block") blockIdsOf(element, this.rootIds()).forEach((blockId) => this.runtime.blocks.removeBlock(blockId));
      });
      this.elements.removeElements([...new Set([...leaves, ...selected.filter((id) => this.element(id)?.type === "group")])]);
    });
  }

  /** @returns Leaf IDs represented by an element or nested group selection. */
  getLeaves(items: readonly string[]): string[] { return this.leaves(items); }
  /** @returns Direct parent within this view, or undefined for a view root or missing element. */
  getParentId(id: string): string | undefined { return this.parentId(id); }

  /** @returns Detached active canvas selection. */
  getSelection() { return this.selection.get(); }

  /** Executes a registered visual command using this controller's fixed view and canvas. */
  execute(name: string, payload?: unknown): unknown {
    const handler = this.commandHandlers.get(name);
    if (!handler) throw new Error(`Unknown visual command ${name}`);
    return handler(this, payload);
  }

  private registerCommands(): () => void {
    const registrations: Array<{ dispose(): void }> = [];
    const register = (name: string, handler: (controller: EdgelessVisualController, payload?: unknown) => unknown) => {
      this.commandHandlers.set(name, handler);
      if (!this.runtime.commands.has(name)) registrations.push(this.runtime.commands.register(name, (value) => {
        if (isRecord(value) && "editorView" in value && "payload" in value) {
          return handler(this.getDocumentView(value.editorView as EditorViewApi), value.payload);
        }
        return handler(this, value);
      }));
    };
    register("edgeless.visual.create", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.visual.create">;
      return controller.create(data);
    });
    register("edgeless.visual.update", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.visual.update">;
      controller.update(data);
    });
    register("edgeless.visual.duplicate", (controller) => controller.duplicateSelection());
    register("edgeless.visual.delete", (controller) => controller.deleteSelection());
    register("edgeless.selection.get", (controller) => controller.getSelection());
    register("edgeless.selection.set", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.set">;
      controller.select("items" in data ? data.items : data);
    });
    register("edgeless.selection.clear", (controller) => controller.clearSelection());
    register("edgeless.selection.move", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.move">;
      controller.move(Number(data.dx), Number(data.dy));
    });
    register("edgeless.selection.resize", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.resize">;
      controller.resize(Number(data.width), Number(data.height));
    });
    register("edgeless.selection.group", (controller) => controller.group());
    register("edgeless.selection.ungroup", (controller) => controller.ungroup());
    register("edgeless.selection.align", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.align">;
      const mode = typeof data === "string" ? data : data.alignment;
      if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Unsupported alignment");
      controller.align(mode);
    });
    register("edgeless.selection.distribute", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.distribute">;
      const axis = typeof data === "string" ? data : data.axis;
      if (axis !== "horizontal" && axis !== "vertical") throw new Error("Unsupported distribution axis");
      controller.distribute(axis);
    });
    register("edgeless.selection.reorder", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.selection.reorder">;
      const direction = typeof data === "string" ? data : data.direction;
      if (!["front", "forward", "backward", "back"].includes(direction)) throw new Error("Unsupported reorder direction");
      controller.reorder(direction);
    });
    register("edgeless.tool.set", (controller, value) => {
      const data = value as VisualCommandPayload<"edgeless.tool.set">;
      controller.setTool(data);
    });
    return () => registrations.reverse().forEach((registration) => registration.dispose());
  }

  private registerToolSelectShortcut(): void {
    const dispose = this.editor.keyboard.register({
      id: KEYBOARD_BINDING_IDS.edgelessToolSelect,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessToolSelect],
      mode: "edgeless",
      priority: 20,
      when: ({ root }) => !root.dataset.transforming && this.tools.getTool().tool !== "select",
    }, () => {
      this.setTool("select");
      return true;
    });
    this.registrations.push({ dispose });
  }

  private registerClipboard(): void {
    // Label editors are plain-text hosts. Claiming copy/paste here would
    // serialize the selected visual and ignore the caret inside the label.
    const write = (event: ClipboardEvent, cut: boolean, editorView: EditorViewApi): boolean => {
      const controller = this.getDocumentView(editorView);
      const snapshot = controller.selection.get();
      if (!snapshot.active || !snapshot.items.length) return false;
      const bundle = controller.createClipboardBundle(snapshot.items);
      const text = this.clipboardText(bundle);
      event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(bundle));
      event.clipboardData?.setData("text/plain", text);
      event.clipboardData?.setData("text/html", `<p>${this.escapeHtml(text).replace(/\n/g, "<br>")}</p>`);
      event.clipboardData?.setData("text/markdown", text);
      if (cut) controller.deleteSelection();
      return true;
    };
    this.editor.events.register({
      id: "edgeless.visuals.copy",
      type: "copy",
      capture: true,
      mode: "edgeless",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    }, ({ raw, editorView }) => write(raw, false, editorView));
    this.editor.events.register({
      id: "edgeless.visuals.cut",
      type: "cut",
      capture: true,
      mode: "edgeless",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    }, ({ raw, editorView }) => write(raw, true, editorView));
    this.editor.events.register({
      id: "edgeless.visuals.paste",
      type: "paste",
      capture: true,
      mode: "edgeless",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    }, ({ raw, editorView }) => {
      const structured = raw.clipboardData?.getData(RIVTO_CLIPBOARD_MIME);
      if (!structured) return false;
      let bundle: ClipboardBundle;
      try {
        bundle = JSON.parse(structured) as unknown as ClipboardBundle;
        validateClipboardBundle(bundle);
      } catch {
        return false;
      }
      if (!bundle.elements?.length) return false;
      this.getDocumentView(editorView).pasteClipboardBundle(bundle);
      return true;
    });
  }

  private createClipboardBundle(items: readonly string[]): ClipboardBundle {
    const leaves = this.leaves(items);
    const included = new Set(leaves);
    const collect = (id: string): void => { const group = this.groupRecord(id); if (!group || included.has(id)) return; included.add(id); group.children.forEach(collect); };
    items.forEach(collect);
    const rootIds = this.rootIds();
    const blockIds = new Set(leaves.flatMap((id) => { const element = this.element(id); return element?.type === "block" ? blockIdsOf(element, rootIds) : []; }));
    const blocks = [...blockIds].flatMap((id) => this.runtime.blocks.getBlock(id) ?? []).map(copy);
    return {
      version: 4,
      blocks,
      elements: this.elements.getElementNodes().filter((element) => included.has(element.id)).map(copy),
      selectedElementIds: [...items],
    };
  }

  private pasteClipboardBundle(bundle: ClipboardBundle): EditorElementNode[] {
    validateClipboardBundle(bundle);
    if (!Array.isArray(bundle.elements)) throw new Error("Invalid edgeless clipboard payload");
    const elementMap = this.elements.createImportIdMap(
      bundle.elements.map((element) => element.id),
    );
    const sourceRootIds = bundle.blocks.map((block) => block.id);
    const sourceElements = bundle.elements.map(copy);
    const selected = (bundle.selectedElementIds ?? []).flatMap((id) => elementMap.get(id) ?? []);
    let elements: EditorElementNode[] = [];
    const results: EditorElementNode[] = [];
    this.runtime.history.batchUpdates(() => {
      const afterId = this.rootIds().at(-1);
      const imported = this.runtime.blocks.importForest(bundle.blocks, afterId);
      const parentId = "runtime" in this.editor ? this.editor.panel?.rootBlockId : undefined;
      if (parentId && !afterId && imported.roots.length) {
        this.runtime.blocks.moveBlocks(imported.roots.map((block) => block.id), parentId, "inside");
      }
      const blockMap = imported.idMap;
      elements = sourceElements.map((element): EditorElementNode => {
        const props = copyElementProps(element, elementMap);
        if (element.type === "block") Object.assign(props, blockRangeProps(blockIdsOf(element, sourceRootIds).flatMap((id) => blockMap.get(id) ?? [])));
        return { ...element, id: elementMap.get(element.id)!, frame: { ...element.frame, x: element.frame.x + 24, y: element.frame.y + 24 }, props };
      });
      const blockElements = elements.filter((element) => element.type === "block");
      const order = this.rootIds();
      const first = blockElements.flatMap((element) => blockIdsOf(element, order))[0];
      const before = first ? order[order.indexOf(first) - 1] : undefined;
      if (before) insertBlockElementSeparator(this.runtime, before);
      blockElements.slice(0, -1).forEach((element) => {
        const last = blockIdsOf(element, order).at(-1);
        if (last) insertBlockElementSeparator(this.runtime, last);
      });
      elements.forEach((element) => {
        try {
          const inserted = this.elements.insertElement({ ...element, childIds: [] });
          results.push(this.elements.getElementNode(inserted.id)!);
        } catch (error) {
          throw new Error(`Failed to paste ${element.type} element ${element.id}`, { cause: error });
        }
      });
      restoreElementChildren(this.elements, sourceElements, elementMap);
    });
    this.selection.set(selected.length ? selected : results.map(({ id }) => id));
    return results;
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

  /** Activates one canvas interaction tool. */
  setTool(value: EdgelessVisualTool | "select"): void { return this.tools.setTool(value); }

  /** Replaces the active canvas selection with validated element references. */
  select(value: unknown): void {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !this.element(id))) throw new Error("Edgeless selection must contain existing element IDs");
    this.selection.set(value as string[]);
  }

  /** Clears the active canvas selection. */
  clearSelection(): void { this.selection.clear(); }

  /** @returns Complete top-level elements created from the active selection. */
  duplicateSelection(): EditorElementNode[] {
    const items = this.selection.get().items;
    if (!items.length) return [];
    const created = this.pasteClipboardBundle(this.createClipboardBundle(items));
    const createdById = new Map(created.map((element) => [element.id, element]));
    return this.selection.get().items.flatMap((id) => createdById.get(id) ?? []);
  }

  private translate(items: readonly string[], dx: number, dy: number): void {
    this.runtime.history.batchUpdates(() => this.leaves(items).forEach((id) => { const frame = this.element(id)?.frame; if (frame) this.setFrame(id, { ...frame, x: frame.x + dx, y: frame.y + dy }); }));
  }

  private leaves(items: readonly string[], visited = new Set<string>()): string[] {
    return items.flatMap((id): string[] => { if (visited.has(id)) return []; visited.add(id); const group = this.groupRecord(id); return group ? this.leaves(group.children, visited) : this.element(id) ? [id] : []; });
  }

  /**
   * Finds same-level connectors whose two endpoints are contained by selected objects.
   *
   * This derives ownership for older persisted groups that predate automatic
   * connector membership, while new groups persist the same connector IDs.
   *
   * @param items - Selected element or group IDs.
   * @returns Connector IDs in document layer order.
   */
  private internalConnectorIds(items: readonly string[]): string[] {
    const contained = new Set(items);
    const collect = (id: string): void => {
      this.groupRecord(id)?.children.forEach((child) => {
        if (contained.has(child)) return;
        contained.add(child);
        collect(child);
      });
    };
    items.forEach(collect);
    const parents = new Set(items.map((id) => this.parentId(id)));
    const parentId = parents.size === 1 ? [...parents][0] : undefined;
    return parents.size === 1
      ? this.getVisuals().filter((visual) => visual.kind === "connector"
        && !contained.has(visual.id)
        && this.parentId(visual.id) === parentId
        && Boolean(visual.source.elementId && contained.has(visual.source.elementId))
        && Boolean(visual.target.elementId && contained.has(visual.target.elementId)))
        .map((visual) => visual.id)
      : [];
  }

  // Resolve through this controller so view proxies keep their Panel boundary.
  private get geometry() { return new ElementGeometry((id) => this.element(id)); }
  private bounds(id: string): VisualFrame | undefined { return this.geometry.bounds(id); }

  private setFrame(id: string, frame: VisualFrame): void {
    const element = this.element(id);
    if (!element || element.type === "group") return;
    const next = this.frame(frame);
    this.elements.updateElement(id, { frame: next, props: drawingResizeProps(element, next) });
  }
  private parentId(id: string): string | undefined {
    const parent = this.elements.getParentId(id);
    // Stop group selection and connector attachment at the Panel boundary.
    return parent && this.elements.hasElement(parent) ? parent : undefined;
  }

  private normalizeConnectors(): void {
    this.getVisuals().filter((visual): visual is Extract<EdgelessVisual, { kind: "connector" }> => visual.kind === "connector").forEach((connector) => {
      let missing = false;
      const resolve = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
        if (!endpoint.elementId) return endpoint;
        const inSubtree = this.element(endpoint.elementId) !== undefined;
        const frame = inSubtree ? this.bounds(endpoint.elementId) : undefined;
        if (!frame) {
          missing = true;
          const detached = { ...endpoint };
          delete detached.elementId;
          return detached;
        }
        return { ...endpoint, position: endpointPoint(endpoint, this.geometry.frame(endpoint.elementId), this.rotation(endpoint.elementId)) };
      };
      const source = resolve(connector.source);
      const target = resolve(connector.target);
      if (missing && this.options.orphanConnectors === "delete") { this.elements.removeElement(connector.id); return; }
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
        this.elements.updateElement(connector.id, { frame, props: { source, target } });
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

  private resolveEndpoint(endpoint: ConnectorEndpoint): { x: number; y: number } {
    const frame = endpoint.elementId ? this.geometry.frame(endpoint.elementId) : undefined;
    return endpointPoint(endpoint, frame, endpoint.elementId ? this.rotation(endpoint.elementId) : 0);
  }

  private rotation(id: string): number {
    const element = this.element(id);
    return element?.type !== "connector" && typeof element?.props.rotation === "number" ? normalizeRotation(element.props.rotation) : 0;
  }

  private remember(kind: EdgelessVisual["kind"], patch: Record<string, unknown>): void { return this.tools.remember(kind, patch); }

  private element(id: string): EditorElementNode | undefined { return this.elements.getElementNode(id); }
  private visual(id: string): EdgelessVisual | undefined { return this.getVisuals().find((visual) => visual.id === id); }
  private groupRecord(id: string): VisualGroup | undefined {
    const element = this.element(id);
    if (element?.type !== "group") return undefined;
    return { id, title: typeof element.props.title === "string" ? element.props.title : "Group", children: element.childIds };
  }

  private frame(value: VisualFrame): VisualFrame {
    if (![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) throw new Error("Visual frame requires finite positive geometry");
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }


}
