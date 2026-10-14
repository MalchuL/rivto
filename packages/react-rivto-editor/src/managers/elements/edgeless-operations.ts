import type { EdgelessToolbarTool } from "../edgeless-toolbar/types";
import { ChildrenPanel } from "@chulane/rivto";
import {
  type ClipboardBundle,
  type EditorElementNode,
  type EditorElementInput,
} from "@chulane/rivto";
import type { CreateElementInput } from "./types";
import type { ReactPanelApi } from "../../panels/types";
import type { ReactEditorApi } from "../../editor/types";
import { blockIdsOf } from "../../elements/block-element-projection";
import { EdgelessSelectionRuntime } from "../../extensions/built-ins/selection/edgeless-runtime";
import type { EdgelessSelectionRef } from "../../extensions/built-ins/selection/types";
import { ElementGeometry } from "../../elements/element-geometry";
import { drawingDefaults, EdgelessToolState } from "./tool-state";
import type {
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessReorder,
  EdgelessVisualTool,
  PresetPayload,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "../../elements/visuals/types";
import { normalizeRotation, unionFrames } from "../../elements/visuals/utils/geometry";

const DEFAULT_FRAME: VisualFrame = { x: 120, y: 120, width: 160, height: 120 };
const copy = <Value>(value: Value): Value => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
/**
 * Implements panel-bound canvas operations; definitions, commands and connector
 * maintenance have separate owners.
 *
 * Element reads and writes use the receiving panel's fixed boundary, or the whole
 * document for named commands without a panel. Selection belongs to the receiving
 * occurrence; creation tools and defaults are retained by the owning edgeless representation.
 * Property previews remain local until committed through document history.
 */
export class EdgelessOperations {
  private readonly documentPanel: ChildrenPanel;
  private rootIds() { return this.reactPanel ? this.reactPanel.blocks.getRootIds() : this.runtime.blocks.getRootIds(); }
  /**
   * Resolves element operations for the receiving occurrence.
   *
   * @returns Element operations bound to this panel; shared maintenance without
   * a receiving panel uses the whole document.
   */
  get elements() { return this.reactPanel ? this.reactPanel.elements : this.runtime.elements; }

  private get defaults() { return this.tools.defaults; }
  private readonly selection;
  private readonly listeners = new Set<() => void>();
  private unsubscribeDocument?: () => void;
  private unsubscribeTools?: () => void;
  private unsubscribeTypes?: () => void;
  private unsubscribeToolbar?: () => void;
  private revision = 0;
  private readonly sharedCreationDefaults = new Map<string, Record<string, unknown>>();
  private readonly creationDefaults = new Map<string, Record<string, unknown>>();
  private readonly propertyPreview = new Map<string, Record<string, unknown>>();

  /**
   * Creates commands for one panel occurrence or the complete document.
   *
   * @param runtime - Owning React editor with first-class element storage.
   * @param tools - Tool state owned by the edgeless representation; standalone operations get isolated defaults.
   * @param reactPanel - Fixed receiving occurrence; omitted only for document-level named commands.
   * @throws If the panel belongs to another React editor.
   */
  constructor(readonly runtime: ReactEditorApi, readonly reactPanel?: ReactPanelApi, private readonly tools = new EdgelessToolState(runtime.edgelessToolbar)) {
    if (reactPanel && reactPanel.editor !== runtime) throw new Error("Canvas operations require a panel from the same React editor");
    this.documentPanel = new ChildrenPanel(runtime);
    this.selection = new EdgelessSelectionRuntime(reactPanel ?? runtime);
  }

  /**
   * Observes document, element type, and local tool changes after mount; returns cleanup and permits a later mount.
   *
   * @returns Cleanup that disconnects subscriptions and discards local previews.
   */
  observeChanges(): () => void {
    const onTypesChange = () => {
      const tool = this.tools.getTool();
      if (tool.tool === "element" && !this.runtime.elementTypes.get(tool.type)?.creation) this.tools.setTool("select");
      this.emit();
    };
    onTypesChange();
    this.unsubscribeTypes = this.runtime.elementTypes.subscribe(onTypesChange);
    this.tools.reconcileToolbar();
    this.unsubscribeToolbar = this.runtime.edgelessToolbar.subscribe(() => {
      this.tools.reconcileToolbar();
      this.emit();
    });
    this.unsubscribeTools = this.tools.subscribe(() => this.emit());
    this.unsubscribeDocument = this.runtime.subscribe(() => {
      this.emit();
    });
    return () => this.destroy();
  }

  private emit(): void {
    this.revision += 1;
    [...this.listeners].forEach((listener) => listener());
  }

  /**
   * Snapshot token for React external-store subscriptions.
   *
   * @returns Version incremented by document, type, tool, and preview notifications.
   */
  getRevision(): number { return this.revision; }

  /**
   * Reads visual elements with registered defaults and local property previews.
   *
   * Block cards and groups are excluded. Registered defaults are merged before previews.
   * Frame and property containers are copied shallowly; nested property values
   * may still be shared and must be treated as read-only.
   * Previews invalidated by document changes fall back to persisted properties and defaults.
   *
   * @returns Detached visual panels backed by first-class elements, within this
   * instance's element scope; an empty array when no visual elements exist.
   */
  getVisuals(): Array<Record<string, unknown> & { id: string; kind: string; frame: VisualFrame; zIndex: number }> {
    return this.getRenderedElements().map(element => ({ ...element.props, id: element.id, kind: element.type, frame: element.frame, zIndex: element.zIndex }));
  }

  /**
   * Reads renderable leaf elements with registered defaults and local previews merged into props.
   * Invalidated previews fall back to persisted properties and defaults without discarding pending patches.
   * @returns Detached element records for this panel; block cards and groups have their own surface hosts.
   */
  getRenderedElements(): EditorElementNode[] {
    return this.elements.getElementNodes().filter(element => element.type !== 'block' && element.type !== 'group').map(element => this.renderedElement(element));
  }

  /**
   * Reads a presentation snapshot, falling back to persisted properties and defaults for an invalidated preview.
   * @param id - Element in this panel.
   * @returns Current presentation snapshot, or undefined when missing; pending patches remain available for commit or cancellation.
   */
  getRenderedElement(id: string): EditorElementNode | undefined {
    const element = this.elements.getElementNode(id);
    if (!element) return undefined;
    return this.renderedElement(element);
  }

  private renderedElement(element: EditorElementNode): EditorElementNode {
    const definition = this.runtime.elementRegistry.get(element.type);
    const preview = this.propertyPreview.get(element.id);
    let props = { ...definition?.defaults, ...element.props, ...preview };
    if (preview && definition?.validate) {
      try {
        props = definition.validate(copy(props));
      } catch {
        // Concurrent document changes can invalidate an otherwise valid local preview.
        props = { ...definition.defaults, ...element.props };
      }
    }
    return { ...element, frame: { ...element.frame }, props };
  }

  /**
   * Live property preview that does not create an undo step.
   *
   * Values are cloned and merged per ID; preview changes notify local subscribers.
   *
   * @param ids - Visual IDs whose rendered properties should be previewed.
   * @param patch - Temporary property values; document records remain unchanged.
   * @throws If the selection is empty, a target is missing, types differ, or validation rejects a patch.
   * All targets are checked before any pending preview is changed.
   */
  previewProperties(ids: readonly string[], patch: Record<string, unknown>): void {
    const targets = ids.map(id => this.getRenderedElement(id));
    if (!targets.length || targets.some(element => !element || element.type !== targets[0]!.type)) throw new Error('Property preview requires existing elements of one type');
    const prepared = targets.map(element => {
      const props = copy({ ...element!.props, ...this.propertyPreview.get(element!.id), ...patch });
      this.runtime.elementRegistry.get(element!.type)?.validate?.(props);
      return element!.id;
    });
    prepared.forEach((id) => {
      this.propertyPreview.set(id, { ...this.propertyPreview.get(id), ...copy(patch) });
    });
    this.emit();
  }

  /**
   * Commits the live property preview as one undoable transaction.
   *
   * Applies patches through the element manager, then clears previews and notifies
   * local subscribers. Deleted targets are skipped. An empty preview still emits a notification.
   *
   * @throws If a remaining target rejects the patch; pending previews remain available for cancellation.
   */
  commitPropertyPreview(): void {
    const entries = [...this.propertyPreview.entries()];
    if (!entries.length) {
      this.emit();
      return;
    }
    const updates = entries.filter(([id]) => this.elements.hasElement(id)).map(([id, props]) => ({ id, patch: { props } }));
    const updated = this.elements.updateElements(updates);
    updated.forEach(element => this.remember(element.type, element.props));
    this.propertyPreview.clear();
    this.emit();
  }

  /**
   * Drops an uncommitted property preview without changing persisted elements.
   *
   * Notifies local subscribers only when pending preview values were present.
   */
  discardPropertyPreview(): void {
    if (!this.propertyPreview.size) return;
    this.propertyPreview.clear();
    this.emit();
  }

  /**
   * True while property gestures have uncommitted preview values.
   *
   * @returns Whether any element has pending preview properties.
   */
  hasPropertyPreview(): boolean { return this.propertyPreview.size > 0; }

  /**
   * Reads logical groups within this instance's element scope.
   *
   * @returns Detached logical groups backed by `group` elements, using each record's
   * ordered child IDs and title, or the title Group when none is stored.
   */
  getGroups(): VisualGroup[] {
    return this.elements.getElementNodes().flatMap((element) => {
      if (element.type !== "group") return [];
      const children = element.childIds;
      return [{ id: element.id, title: typeof element.props.title === "string" ? element.props.title : "Group", children }];
    });
  }

  /**
   * Reads the axis-aligned outer bounds of an element or group.
   *
   * @param item - Element ID.
   * @returns Derived outer geometry, or undefined when geometry is unavailable.
   */
  getBounds(item: EdgelessSelectionRef): VisualFrame | undefined { return this.bounds(item); }
  /**
   * Reads canvas geometry before applying visual rotation.
   *
   * @param item - Element ID.
   * @returns Its frame before rotation; groups derive it from current descendants.
   * Returns undefined when the element has no usable geometry.
   */
  getFrame(item: EdgelessSelectionRef): VisualFrame | undefined { return this.geometry.frame(item); }
  /**
   * Reads rotation from current element properties.
   *
   * @param item - Element ID.
   * @returns Its normalized visual rotation in degrees, or zero for absolute-geometry types or missing rotation.
   */
  getRotation(item: EdgelessSelectionRef): number { return this.rotation(item); }
  /**
   * Reads the stored stacking order without deriving group bounds.
   *
   * @param item - Element ID.
   * @returns Its persisted stacking order, or zero when the element is missing.
   */
  getZIndex(item: EdgelessSelectionRef): number { return this.element(item)?.zIndex ?? 0; }
  /**
   * Derives the stacking order used by a group hit target.
   *
   * @param item - Group ID.
   * @returns A layer below every descendant and the group record, so older lower canvas content remains behind it.
   */
  getGroupHitZIndex(item: EdgelessSelectionRef): number {
    return Math.min(...this.leaves([item]).map((id) => this.element(id)?.zIndex ?? 0), this.getZIndex(item)) - 1;
  }
  /**
   * Reads the creation tool owned by this mounted edgeless representation.
   *
   * @returns Current session creation tool; treat the returned object as read-only.
   */
  getTool(): EdgelessVisualTool { return this.tools.getTool(); }
  /**
   * Reads the remembered size for placement gestures.
   *
   * @param fallback - Initial size from the creation factory; omitted values use the standard 160×120 size.
   * @returns Detached remembered size, or the supplied/default initial size, in canvas units.
   */
  getPlaceSize(fallback?: Pick<VisualFrame, "width" | "height">): Pick<VisualFrame, "width" | "height"> { return this.tools.getPlaceSize(fallback); }
  /**
   * Remembers the final interactive drag size for the active place preset.
   *
   * @param frame - Final drag geometry in canvas units; only width and height are remembered.
   */
  rememberPlaceSize(frame: VisualFrame): void { return this.tools.rememberPlaceSize(frame); }
  /**
   * Reads creation properties remembered for this mounted edgeless representation.
   *
   * @returns Detached session defaults used by creation menus.
   */
  getDefaults() { return this.tools.getDefaults(); }
  /**
   * Resolves the last activated entry for a creation-toolbar group (session memory).
   *
   * @param groupId - Registered toolbar group to inspect.
   * @returns Shared registered entry, falling back to the group default or first tool;
   * undefined when the group is absent or has no available members.
   */
  getGroupTool(groupId: string): EdgelessToolbarTool | undefined { return this.tools.getGroupTool(groupId); }
  /**
   * Activates the remembered entry, or the first available default, for a group.
   *
   * @param groupId - Toolbar group whose remembered tool becomes active.
   * @throws If these operations have no receiving React panel.
   */
  activateToolbarGroup(groupId: string): void {
    const entry = this.getGroupTool(groupId);
    if (entry) this.activateToolbarTool(entry.id);
  }
  /**
   * Activates a registered toolbar entry using this panel's shared operations.
   *
   * @param id - Registered tool identity; an absent entry is ignored.
   * @throws If these operations have no receiving React panel.
   */
  activateToolbarTool(id: string): void {
    const entry = this.runtime.edgelessToolbar.getTool(id);
    if (!entry) return;
    if (!this.reactPanel) throw new Error('Toolbar activation requires a React panel');
    entry.activate({ operations: this, reactPanel: this.reactPanel });
  }
  /**
   * Enters place mode for a toolbar preset (click, not drag-drop).
   *
   * @param payload - Toolbar preset; sticker style fields are retained in the active tool.
   */
  setPlaceTool(payload: PresetPayload): void { return this.tools.setPlaceTool(payload); }
  /**
   * Updates local creation defaults without mutating document content.
   *
   * Only keys already present in the selected defaults are copied; subscribers are notified.
   *
   * @param kind - Built-in visual category whose creation defaults change.
   * @param patch - Property values to clone into the session defaults.
   */
  setCreationDefaults(kind: "shape" | "drawing" | "text" | "sticker" | "connector", patch: Record<string, unknown>): void { return this.tools.setCreationDefaults(kind, patch); }
  /**
   * Selects a brush and its complete visual preset for subsequent strokes.
   *
   * Re-selecting the current brush preserves its edited session properties.
   *
   * @param brush - Built-in brush preset to activate.
   */
  setDrawingBrush(brush: keyof typeof drawingDefaults): void { return this.tools.setDrawingBrush(brush); }
  /**
   * Observes local canvas state invalidations without an initial callback.
   *
   * Connect this instance to receive document, type, and local tool changes.
   * Preview changes also notify listeners. The callback receives no snapshot.
   *
   * @param listener - Callback that can reread tool, selection, and visual state.
   * @returns Subscription disposer; destroy also releases this listener.
   */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  /**
   * Releases commands and local listeners without deleting persisted elements.
   *
   * Disconnects document, type, and tool observers and discards pending property
   * previews. Local tools and defaults remain available while the owning edgeless representation lives. A later
   * observeChanges call can subscribe this instance again after the panel remounts.
   */
  destroy(): void {
    this.unsubscribeDocument?.();
    this.unsubscribeDocument = undefined;
    this.unsubscribeTypes?.();
    this.unsubscribeTypes = undefined;
    this.unsubscribeToolbar?.();
    this.unsubscribeToolbar = undefined;
    this.unsubscribeTools?.();
    this.unsubscribeTools = undefined;
    this.discardPropertyPreview();
    this.listeners.clear();
  }

  /**
   * Prepares detached creation data for rendering a preview without modifying the document.
   *
   * Copies registered/session defaults and explicit props, runs the registration's pure
   * geometry preparation and validates props. No ID is allocated, selected or registered.
   * Commit the original input: final insertion runs core validation and middleware again.
   * The preview zIndex defaults to zero; insertion computes its actual stacking position.
   * @param input - Draft data; missing frame fields use the standard creation frame.
   * @returns Detached prepared input with complete frame and normalized props.
   * @throws If the type is absent, its preparation/validation rejects data, or frame is invalid.
   */
  prepareElementCreation(input: CreateElementInput): EditorElementInput & { frame: VisualFrame; props: Record<string, unknown> } {
    const prepared = this.prepareCreationInput(input);
    const props = copy({ ...this.runtime.elementRegistry.get(prepared.type)?.defaults, ...prepared.props });
    return { ...prepared, props: this.runtime.elementRegistry.validate(prepared.type, props) };
  }

  /** Shares defaults and pure geometry preparation; persisted insertion owns its own single validation pass. */
  private prepareCreationInput(input: CreateElementInput): EditorElementInput & { frame: VisualFrame; props: Record<string, unknown> } {
    const registration = this.runtime.elementTypes.get(input.type);
    if (!registration) throw new Error(`Element type ${input.type} is not registered`);
    const preparedInput = { ...copy(input), frame: this.frame({ ...DEFAULT_FRAME, ...input.frame }), zIndex: input.zIndex ?? 0 };
    const sessionDefaults = this.sessionDefaults(registration.behavior?.defaultsGroup, registration.definition.defaults) ?? registration.definition.defaults ?? {};
    const defaults = registration.behavior?.creationDefaults?.(sessionDefaults, preparedInput) ?? sessionDefaults;
    const props = copy({ ...defaults, ...this.creationDefaults.get(input.type) });
    for (const [key, value] of Object.entries(input.props ?? {})) {
      if (value !== undefined || !(key in props)) props[key] = copy(value);
    }
    const prepared = { ...preparedInput, props };
    const result = registration.behavior?.create?.(prepared, this.reactPanel ?? this.documentPanel) ?? prepared;
    return { ...result, frame: this.frame({ ...DEFAULT_FRAME, ...result.frame }), props: result.props ?? {} };
  }

  /**
   * Creates a registered canvas element in this panel and selects it.
   *
   * Registered defaults and remembered session values are copied before explicit properties.
   * A registration may derive defaults (for example, when an explicit drawing brush
   * differs from the current brush), then prepare geometry without mutating the input.
   * Custom types retain opaque property values, including null and nested content.
   *
   * @param input - Persisted type and initial fields; missing frame fields use x=120, y=120, width=160, height=120
   * in canvas units. Omitted zIndex places the element above current panel elements.
   * @returns Complete created node. The new ID replaces the active selection.
   * @throws If the type is not registered, geometry is not finite and positive, or its definition rejects the input.
   */
  createElement(input: CreateElementInput): EditorElementNode {
    const zIndex = input.zIndex ?? Math.max(0, ...this.elements.getElementNodes().map(element => element.zIndex)) + 1;
    const prepared = this.prepareCreationInput({ ...input, zIndex });
    const element = this.elements.insertElement(prepared);
    this.selection.set([element.id]);
    return this.elements.getElementNode(element.id)!;
  }

  /**
   * Creates one validated visual element and selects it.
   *
   * @param payload - Visual kind and persisted values.
   * @returns Complete normalized created element.
   * @throws If the payload type is unregistered or creation processing or validation fails.
   */
  create(payload: CreateVisualPayload): EditorElementNode {
    if (!payload || !this.runtime.elementTypes.get(payload.kind)) throw new Error("Element type is not registered");
    const { kind, frame, ...props } = payload;
    return this.createElement({ type: kind, frame: { ...DEFAULT_FRAME, ...frame }, zIndex: Math.max(0, ...this.elements.getElementNodes().map(element => element.zIndex)) + 1, props });
  }

  /**
   * Patches one visual while keeping identity and type immutable.
   *
   * @param payload - Element identity and mutable visual fields.
   * @returns Complete normalized updated element. Supported properties are also
   * remembered as creation defaults for this panel session.
   * @throws If the visual is missing or processing or validation rejects the patch.
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
      props: safe,
    });
    this.remember(current.type, safe);
    return updated;
  }

  /**
   * Updates opaque properties of one registered element without interpreting property names as geometry.
   * @param id - Existing element in this panel.
   * @param patch - Property keys to merge; validation runs through the element manager.
   * @returns Updated element snapshot.
   * @throws If the element is missing or its definition rejects the patch.
   */
  updateProperties(id: string, patch: Record<string, unknown>): EditorElementNode {
    const updated = this.elements.updateElement(id, { props: patch });
    this.remember(updated.type, updated.props);
    return updated;
  }

  /**
   * Applies one property patch to an exact-type selection in one undo step.
   *
   * @param ids - Nonempty visual selection; all targets must exist and have the same type.
   * @param patch - Mutable visual fields applied to every target.
   * @throws If the selection is empty, a target is missing, types differ, or a patch fails validation.
   */
  updateMany(ids: readonly string[], patch: Record<string, unknown>): void {
    const visuals = ids.map((id) => this.visual(id));
    if (!visuals.length || visuals.some((visual) => !visual || visual.type !== visuals[0]!.type)) throw new Error("Shared properties require one visual type");
    this.runtime.history.batchUpdates(() => ids.forEach((id) => this.update({ id, patch: patch as UpdateVisualPayload["patch"] })));
  }

  /**
   * Moves the complete active selection by a canvas delta.
   *
   * Group descendants are translated once in one history batch.
   *
   * @param dx - Finite horizontal delta in canvas units.
   * @param dy - Finite vertical delta in canvas units.
   * @throws If either delta is not finite.
   */
  move(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Move delta must be finite");
    this.translate(this.selection.get().items, dx, dy);
  }

  /**
   * Scales the active selection to an exact outer size.
   *
   * Group leaves scale around the selection bounds in one history batch. Missing
   * bounds, nonpositive sizes, and degenerate selection bounds cause no change.
   *
   * @param width - Requested selection width in canvas units.
   * @param height - Requested selection height in canvas units.
   */
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
   * Group membership is derived by these panel-bound operations; the model stores an ordinary parent.
   * All writes use the editor processing pipeline within one history transaction.
   *
   * @returns Detached flat parent record with its final ordered childIds.
   * @throws If fewer than two distinct existing elements are selected, parents
   * differ, or the new record fails processing or validation before insertion.
   */
  group(): EditorElementNode {
    const selected = [...this.selection.get().items];
    const internalConnectors = this.relatedElementIds(selected);
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
      if (this.reactPanel) {
        this.reactPanel.elements.moveElements([group.id], parentId === null ? { root: true, beforeId: ordered[0] } : { parentId, beforeId: ordered[0] });
      } else {
        this.runtime.elements.moveElements([group.id], { parentId, beforeId: ordered[0] });
      }
      this.elements.moveElements(ordered, { parentId: group.id });
      return this.elements.getElementNode(group.id)!;
    });
    this.selection.set([group.id]);
    return group;
  }

  /**
   * Replaces selected groups with their children and removes their records.
   *
   * Children retain IDs, order, and canvas coordinates. Changes share one history
   * batch; the resulting children replace the active selection. Non-group IDs are ignored.
   */
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

  /**
   * Aligns selected top-level elements without changing sizes.
   *
   * Group leaves move together in one history batch. Fewer than two targets with
   * usable bounds cause no change.
   *
   * @param mode - Edge or center of the selection bounds to align against.
   */
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

  /**
   * Distributes three or more selected elements across their current outer span.
   *
   * Equal gaps are computed along the current outer span, which may produce
   * negative gaps for overlapping targets. Changes share one history batch.
   *
   * @param axis - Canvas axis along which elements are sorted and spaced.
   */
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

  /**
   * Reorders selected leaves in the shared element layer.
   *
   * Groups expand to leaves and internal connectors. Relative layer order within
   * the moved selection is preserved; sequential stacking values are written together.
   *
   * @param direction - Move to an extreme layer or one step relative to stationary elements.
   */
  reorder(direction: EdgelessReorder): void {
    const items = this.selection.get().items;
    const selected = new Set([...this.leaves(items), ...this.relatedElementIds(items)]);
    const layers = this.elements.getElementNodes().filter((element) => element.type !== "group").sort((a, b) => a.zIndex - b.zIndex).map((element) => element.id);
    const moving = layers.filter((id) => selected.has(id));
    const stationary = layers.filter((id) => !selected.has(id));
    const frontmost = Math.max(...moving.map((id) => layers.indexOf(id)));
    const current = stationary.filter((id) => layers.indexOf(id) < frontmost).length;
    let insertion: number;
    if (direction === "front") insertion = stationary.length;
    else if (direction === "back") insertion = 0;
    else if (direction === "forward") insertion = Math.min(stationary.length, current + 1);
    else insertion = Math.max(0, current - 1);
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

  /**
   * Structurally deletes selected elements and block trees represented by block elements.
   *
   * Clears the active selection after attempting deletion, including when panel
   * block protection prevents the deletion.
   */
  deleteSelection(): void {
    this.deleteItems(this.selection.get().items);
    this.selection.clear();
  }

  /**
   * Deletes arbitrary top-level canvas targets, expanding groups and block cards.
   *
   * Group leaves and represented block trees are removed in one history batch.
   * If any represented block is protected by the panel, nothing is deleted.
   *
   * @param items - Element or group IDs to delete; missing IDs contribute no leaves.
   */
  deleteItems(items: readonly string[]): void {
    const selected = [...items];
    const leaves = this.leaves(selected);
    const blockIds = leaves.flatMap(id => {
      const element = this.element(id);
      return element?.type === "block" ? blockIdsOf(element, this.rootIds()) : [];
    });
    const reactPanel = this.reactPanel;
    if (reactPanel && blockIds.some(id => !reactPanel.blocks.canRemove(id))) return;
    this.runtime.history.batchUpdates(() => {
      leaves.forEach((id) => {
        const element = this.element(id);
        if (element?.type === "block") blockIdsOf(element, this.rootIds()).forEach((blockId) => this.runtime.blocks.removeBlock(blockId));
      });
      this.elements.removeElements([...new Set([...leaves, ...selected.filter((id) => this.element(id)?.type === "group")])]);
    });
  }

  /**
   * Expands groups recursively to distinct existing leaf elements.
   *
   * @param items - Element or group IDs; duplicates and missing IDs are ignored.
   * @returns Leaf IDs represented by an element or nested group selection.
   */
  getLeaves(items: readonly string[]): string[] { return this.leaves(items); }
  /**
   * Resolves parentage without exposing an excluded panel container.
   *
   * @param id - Element ID to locate.
   * @returns Direct parent within this panel, or undefined for a panel root or missing element.
   */
  getParentId(id: string): string | undefined { return this.parentId(id); }

  /**
   * Reads the active canvas selection for this occurrence.
   *
   * @returns Detached active canvas selection.
   */
  getSelection() { return this.selection.get(); }

  private createClipboardBundle(items: readonly string[], operation: "copy" | "cut" | "duplicate" = "copy"): ClipboardBundle {
    return this.runtime.clipboard.copyElements(items, (this.reactPanel ?? this.runtime), operation);
  }

  private pasteClipboardBundle(bundle: ClipboardBundle, operation: "paste" | "duplicate" = "paste"): EditorElementNode[] {
    this.runtime.clipboard.paste({ bundle, placement: { mergeText: false } }, (this.reactPanel ?? this.runtime), operation);
    return this.selection.get().items.flatMap(id => this.elements.getElementNode(id) ?? []);
  }

  /**
   * Activates one canvas interaction tool.
   *
   * Updates this panel’s local tool and notifies tool subscribers.
   *
   * @param value - Tool configuration, or select to return to selection mode.
   * @throws If the requested element creation tool is unregistered or the tool configuration is unsupported.
   */
  setTool(value: EdgelessVisualTool | "select"): void {
    if (typeof value === "object" && value.tool === "element" && !this.runtime.elementTypes.get(value.type)?.creation) throw new Error(`Element creation tool ${value.type} is not registered`);
    return this.tools.setTool(value);
  }

  /**
   * Replaces the active canvas selection with validated element references.
   *
   * @param value - Array of existing element IDs within this instance’s element scope.
   * @throws If the value is not an array of strings or any element is absent or outside the panel.
   */
  select(value: unknown): void {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !this.element(id))) throw new Error("Edgeless selection must contain existing element IDs");
    this.selection.set(value as string[]);
  }

  /**
   * Clears the active canvas selection for the receiving occurrence.
   *
   * Persisted elements, local tools, and property previews remain unchanged.
   */
  clearSelection(): void { this.selection.clear(); }

  /**
   * Duplicates the active selection through the clipboard copy/paste pipeline.
   *
   * The clipboard pipeline allocates new identities and updates the selection.
   * @returns Complete top-level elements created from the active selection, or an empty array for an empty selection.
   */
  duplicateSelection(): EditorElementNode[] {
    const items = this.selection.get().items;
    if (!items.length) return [];
    const created = this.pasteClipboardBundle(this.createClipboardBundle(items, "duplicate"), "duplicate");
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
   * Finds same-level related elements whose registered references are all contained by selected objects.
   *
   * This derives ownership for older persisted groups that predate automatic
   * connector membership, while new groups persist the same connector IDs.
   *
   * @param items - Selected element or group IDs.
   * @returns Related element IDs in document layer order; connectors register both endpoints.
   */
  private relatedElementIds(items: readonly string[]): string[] {
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
    if (parents.size !== 1) return [];
    return this.elements.getElementNodes().filter(element => {
      if (contained.has(element.id) || this.parentId(element.id) !== parentId) return false;
      const references = this.runtime.elementTypes.get(element.type)?.behavior?.relatedElements?.(element);
      return Boolean(references?.length && references.every(id => contained.has(id)));
    }).map(element => element.id);
  }

  // Resolve through this controller so panel proxies keep their Panel boundary.
  private get geometry() { return new ElementGeometry((id) => this.element(id), (id) => this.rotation(id)); }
  private bounds(id: string): VisualFrame | undefined { return this.geometry.bounds(id); }

  private setFrame(id: string, frame: VisualFrame): void {
    const element = this.element(id);
    if (!element || element.type === "group") return;
    const next = this.frame(frame);
    this.elements.updateElement(id, { frame: next });
  }
  private parentId(id: string): string | undefined {
    const parent = this.elements.getParentId(id);
    // Stop group selection and connector attachment at the Panel boundary.
    return parent && this.elements.hasElement(parent) ? parent : undefined;
  }

  private rotation(id: string): number {
    const element = this.element(id);
    return !this.runtime.elementTypes.get(element?.type ?? "")?.behavior?.absoluteGeometry && typeof element?.props.rotation === "number" ? normalizeRotation(element.props.rotation) : 0;
  }

  private sessionDefaults(group?: string, initial: Readonly<Record<string, unknown>> = {}): Record<string, unknown> | undefined {
    if (!group) return undefined;
    const paletteDefaults = this.tools.defaults as Record<string, Record<string, unknown>>;
    if (Object.hasOwn(paletteDefaults, group)) return paletteDefaults[group];
    let defaults = this.sharedCreationDefaults.get(group);
    if (!defaults) {
      defaults = copy(initial);
      this.sharedCreationDefaults.set(group, defaults);
    }
    return defaults;
  }

  private remember(type: string, patch: Record<string, unknown>): void {
    const registration = this.runtime.elementTypes.get(type);
    const shared = this.sessionDefaults(registration?.behavior?.defaultsGroup, registration?.definition.defaults);
    if (shared) {
      for (const key of Object.keys(shared)) if (key in patch) shared[key] = copy(patch[key]);
    }
    const remembered = this.creationDefaults.get(type) ?? {};
    for (const key of registration?.rememberedProperties ?? []) {
      if (key in patch) remembered[key] = copy(patch[key]);
    }
    this.creationDefaults.set(type, remembered);
  }

  private element(id: string): EditorElementNode | undefined { return this.elements.getElementNode(id); }
  private visual(id: string): EditorElementNode | undefined { return this.getRenderedElement(id); }
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
