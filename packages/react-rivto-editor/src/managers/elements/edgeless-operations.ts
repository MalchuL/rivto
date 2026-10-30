import { Listeners } from "@chulane/rivto-utils";
import { EdgelessCreationDefaults } from "./edgeless-creation-defaults";
import type { CreationDefaultsScope, ElementCreationDefaults } from "./creation-defaults-types";
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
import type {
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessReorder,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "../../elements/visuals/types";
import { normalizeRotation, unionFrames } from "../../elements/visuals/utils/geometry";

const DEFAULT_FRAME: VisualFrame = { x: 120, y: 120, width: 160, height: 120 };
const copy = <Value>(value: Value): Value => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  /**
   * Resolves element operations for the receiving occurrence.
   *
   * @returns Element operations bound to this panel; shared maintenance without
   * a receiving panel uses the whole document.
   */
  get elements() {
    return this.reactPanel ? this.reactPanel.elements : this.runtime.elements;
  }

  private readonly selection;
  private readonly listeners = new Listeners<{ changed: void }>();
  private unsubscribeDocument?: () => void;
  private unsubscribeTypes?: () => void;
  private revision = 0;
  private unsubscribeCreationDefaults?: () => void;
  private readonly propertyPreview = new Map<string, Record<string, unknown>>();

  /**
   * Creates commands for one panel occurrence or the complete document.
   *
   * @param runtime - Owning React editor with first-class element storage.
   * @param creationDefaults - Surface-owned settings shared with transform controls; omitted values create an isolated session for standalone operations.
   * @param reactPanel - Fixed receiving occurrence; omitted only for document-level named commands.
   * @throws If the panel belongs to another React editor.
   */
  constructor(
    readonly runtime: ReactEditorApi,
    readonly reactPanel?: ReactPanelApi,
    private readonly creationDefaults = new EdgelessCreationDefaults(runtime),
  ) {
    if (reactPanel && reactPanel.editor !== runtime) {
      throw new Error("Canvas operations require a panel from the same React editor");
    }
    this.documentPanel = new ChildrenPanel(runtime);
    this.selection = new EdgelessSelectionRuntime(reactPanel ?? runtime);
  }

  /**
   * Observes document, element type and shared creation-settings changes after mount;
   * returns cleanup and permits a later mount.
   *
   * @returns Cleanup that disconnects subscriptions and discards local previews.
   */
  observeChanges(): () => void {
    this.unsubscribeTypes = this.runtime.elementTypes.subscribe(() => this.emit());
    this.unsubscribeCreationDefaults = this.creationDefaults.subscribe(() => this.emit());
    this.unsubscribeDocument = this.runtime.subscribe(() => {
      this.emit();
    });
    return () => this.destroy();
  }

  /**
   * Snapshot token for React external-store subscriptions.
   *
   * @returns Version incremented by document, type, creation-settings and preview notifications.
   */
  getRevision(): number {
    return this.revision;
  }

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
  getVisuals(): Array<
    Record<string, unknown> & { id: string; kind: string; frame: VisualFrame; zIndex: number }
  > {
    return this.getRenderedElements().map((element) => ({
      ...element.props,
      id: element.id,
      kind: element.type,
      frame: element.frame,
      zIndex: element.zIndex,
    }));
  }

  /**
   * Reads renderable leaf elements with registered defaults and local previews merged into props.
   * Invalidated previews fall back to persisted properties and defaults without discarding pending patches.
   * @returns Detached element records for this panel; block cards and groups have their own surface hosts.
   */
  getRenderedElements(): EditorElementNode[] {
    return this.elements
      .getElementNodes()
      .filter((element) => element.type !== "block" && element.type !== "group")
      .map((element) => this.getRenderedElementSnapshot(element));
  }

  /**
   * Reads a presentation snapshot, falling back to persisted properties and defaults for an invalidated preview.
   * @param id - Element in this panel.
   * @returns Current presentation snapshot, or undefined when missing; pending patches remain available for commit or cancellation.
   */
  getRenderedElement(id: string): EditorElementNode | undefined {
    const element = this.elements.getElementNode(id);
    if (!element) {
      return undefined;
    }
    return this.getRenderedElementSnapshot(element);
  }

  /**
   * Live property preview that does not create an undo step.
   *
   * Values are cloned and merged per ID; preview changes notify local subscribers.
   * Declared style fields also appear in tool controls without changing remembered defaults.
   *
   * @param ids - Visual IDs whose rendered properties should be previewed.
   * @param patch - Temporary property values; document records remain unchanged.
   * @throws If the selection is empty, a target is missing, types differ, or validation rejects a patch.
   * All targets are checked before any pending preview is changed.
   */
  setPropertyPreview(ids: readonly string[], patch: Record<string, unknown>): void {
    const targetElements = ids.map((id) => this.getRenderedElement(id));
    if (
      !targetElements.length ||
      targetElements.some((element) => !element || element.type !== targetElements[0]!.type)
    ) {
      throw new Error("Property preview requires existing elements of one type");
    }
    const validatedIds = targetElements.map((element) => {
      const previewProperties = copy({
        ...element!.props,
        ...this.propertyPreview.get(element!.id),
        ...patch,
      });
      this.runtime.elementRegistry.get(element!.type)?.validate?.(previewProperties);
      return element!.id;
    });
    validatedIds.forEach((id) => {
      this.propertyPreview.set(id, { ...this.propertyPreview.get(id), ...copy(patch) });
    });
    this.creationDefaults.setGroupPropertyPreview(targetElements[0]!.type, patch);
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
    const previewEntries = [...this.propertyPreview.entries()];
    if (!previewEntries.length) {
      this.emit();
      return;
    }
    const updates = previewEntries
      .filter(([id]) => this.elements.hasElement(id))
      .map(([id, props]) => ({ id, patch: { props } }));
    const updated = this.elements.updateElements(updates);
    updated.forEach((element, index) =>
      this.rememberUpdatedProperties(element, updates[index]!.patch.props),
    );
    this.propertyPreview.clear();
    this.creationDefaults.clearGroupPropertyPreviews();
    this.emit();
  }

  /**
   * Drops an uncommitted property preview without changing persisted elements.
   *
   * Notifies local subscribers only when pending preview values were present.
   */
  discardPropertyPreview(): void {
    if (!this.propertyPreview.size) {
      return;
    }
    this.propertyPreview.clear();
    this.creationDefaults.clearGroupPropertyPreviews();
    this.emit();
  }

  /**
   * True while property gestures have uncommitted preview values.
   *
   * @returns Whether any element has pending preview properties.
   */
  hasPropertyPreview(): boolean {
    return this.propertyPreview.size > 0;
  }

  /**
   * Reads logical groups within this instance's element scope.
   *
   * @returns Detached logical groups backed by `group` elements, using each record's
   * ordered child IDs and title, or the title Group when none is stored.
   */
  getGroups(): VisualGroup[] {
    return this.elements.getElementNodes().flatMap((element) => {
      if (element.type !== "group") {
        return [];
      }
      const children = element.childIds;
      return [
        {
          id: element.id,
          title: typeof element.props.title === "string" ? element.props.title : "Group",
          children,
        },
      ];
    });
  }

  /**
   * Reads the axis-aligned outer bounds of an element or group.
   *
   * @param item - Element ID.
   * @returns Derived outer geometry, or undefined when geometry is unavailable.
   */
  getBounds(item: EdgelessSelectionRef): VisualFrame | undefined {
    return this.getElementBounds(item);
  }
  /**
   * Reads canvas geometry before applying visual rotation.
   *
   * @param item - Element ID.
   * @returns Its frame before rotation; groups derive it from current descendants.
   * Returns undefined when the element has no usable geometry.
   */
  getFrame(item: EdgelessSelectionRef): VisualFrame | undefined {
    return this.geometry.frame(item);
  }
  /**
   * Reads rotation from current element properties.
   *
   * @param item - Element ID.
   * @returns Its normalized visual rotation in degrees, or zero for absolute-geometry types or missing rotation.
   */
  getRotation(item: EdgelessSelectionRef): number {
    return this.getNormalizedRotation(item);
  }
  /**
   * Reads the stored stacking order without deriving group bounds.
   *
   * @param item - Element ID.
   * @returns Its persisted stacking order, or zero when the element is missing.
   */
  getZIndex(item: EdgelessSelectionRef): number {
    return this.getElement(item)?.zIndex ?? 0;
  }
  /**
   * Derives the stacking order used by a group hit target.
   *
   * @param item - Group ID.
   * @returns A layer below every descendant and the group record, so older lower canvas content remains behind it.
   */
  getGroupHitZIndex(item: EdgelessSelectionRef): number {
    return (
      Math.min(
        ...this.getLeafIds([item]).map((id) => this.getElement(id)?.zIndex ?? 0),
        this.getZIndex(item),
      ) - 1
    );
  }
  /**
   * Reads initial and current creation settings for this mounted representation.
   *
   * Type values merge registered defaults, type memory and shared group settings.
   * Values are detached; position and identity are never creation defaults.
   *
   * @param scope - Registered type or group whose settings are requested.
   * @returns Detached properties and optional dimensions used by creation menus and placement.
   * @throws If a requested type is not registered.
   */
  getDefaults(scope: CreationDefaultsScope): ElementCreationDefaults {
    return this.creationDefaults.get(scope);
  }
  /**
   * Updates local creation defaults without mutating document content.
   *
   * Only explicitly declared fields are accepted; validation runs before storage
   * and subscribers are notified once after an effective settings change.
   *
   * @param scope - Registered type or group whose creation defaults change.
   * @param patch - Properties and dimensions to clone into the session defaults.
   * @returns Updates settings without mutating document content.
   * @throws If fields are undeclared, dimensions are invalid or the registered settings policy rejects the values.
   */
  setCreationDefaults(scope: CreationDefaultsScope, patch: ElementCreationDefaults): void {
    this.creationDefaults.set(scope, patch);
  }
  /**
   * Observes local canvas state invalidations without an initial callback.
   *
   * Connect this instance to receive document, type, and local tool changes.
   * Preview changes also notify listeners. The callback receives no snapshot.
   *
   * @param listener - Callback that can reread tool, selection, and visual state.
   * @returns Subscription disposer; destroy also releases this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

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
    this.unsubscribeCreationDefaults?.();
    this.unsubscribeCreationDefaults = undefined;
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
  prepareElementCreation(
    input: CreateElementInput,
  ): EditorElementInput & { frame: VisualFrame; props: Record<string, unknown> } {
    const prepared = this.prepareCreationInput(input);
    const props = copy({
      ...this.runtime.elementRegistry.get(prepared.type)?.defaults,
      ...prepared.props,
    });
    return { ...prepared, props: this.runtime.elementRegistry.validate(prepared.type, props) };
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
    const zIndex =
      input.zIndex ??
      Math.max(0, ...this.elements.getElementNodes().map((element) => element.zIndex)) + 1;
    const prepared = this.prepareCreationInput({ ...input, zIndex });
    const element = this.elements.insertElement(prepared);
    this.selection.set([element.id]);
    const created = this.elements.getElementNode(element.id)!;
    this.creationDefaults.remember(created.type, { props: created.props, frame: created.frame });
    return created;
  }

  /**
   * Creates one validated visual element and selects it.
   *
   * @param payload - Visual kind and persisted values.
   * @returns Complete normalized created element.
   * @throws If the payload type is unregistered or creation processing or validation fails.
   */
  create(payload: CreateVisualPayload): EditorElementNode {
    if (!payload || !this.runtime.elementTypes.get(payload.kind)) {
      throw new Error("Element type is not registered");
    }
    const { kind, frame, ...props } = payload;
    return this.createElement({
      type: kind,
      frame: frame
        ? this.validateFrame({
            ...DEFAULT_FRAME,
            ...this.creationDefaults.get({ type: kind }).frame,
            ...frame,
          })
        : undefined,
      zIndex: Math.max(0, ...this.elements.getElementNodes().map((element) => element.zIndex)) + 1,
      props,
    });
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
    const current = this.getVisual(id);
    if (!current) {
      throw new Error(`Edgeless visual ${id} not found`);
    }
    const propertyPatch = copy(patch) as Record<string, unknown>;
    delete propertyPatch.id;
    delete propertyPatch.kind;
    if ("rotation" in propertyPatch) {
      propertyPatch.rotation = normalizeRotation(
        typeof propertyPatch.rotation === "number" ? propertyPatch.rotation : 0,
      );
    }
    const framePatch = isRecord(propertyPatch.frame)
      ? (propertyPatch.frame as Partial<VisualFrame>)
      : undefined;
    delete propertyPatch.frame;
    delete propertyPatch.zIndex;
    const updated = this.elements.updateElement(id, {
      frame: framePatch,
      props: propertyPatch,
    });
    this.rememberUpdatedProperties(updated, propertyPatch, framePatch);
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
    this.rememberUpdatedProperties(updated, patch);
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
    const visuals = ids.map((id) => this.getVisual(id));
    if (!visuals.length || visuals.some((visual) => !visual || visual.type !== visuals[0]!.type)) {
      throw new Error("Shared properties require one visual type");
    }
    this.runtime.history.batchUpdates(() =>
      ids.forEach((id) => this.update({ id, patch: patch as UpdateVisualPayload["patch"] })),
    );
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
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      throw new Error("Move delta must be finite");
    }
    this.translateLeaves(this.selection.get().items, dx, dy);
  }

  /**
   * Scales the active selection to an exact outer size.
   *
   * Group leaves scale around the selection bounds in one validated batch, and successful
   * resizes remember their final dimensions. Missing
   * bounds, nonpositive sizes, and degenerate selection bounds cause no change.
   *
   * @param width - Requested selection width in canvas units.
   * @param height - Requested selection height in canvas units.
   */
  resize(width: number, height: number): void {
    const items = this.selection.get().items;
    const bounds = unionFrames(items.flatMap((id) => this.getElementBounds(id) ?? []));
    if (!bounds || width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    const updates = this.getLeafIds(items).flatMap((id) => {
      const element = this.getElement(id);
      if (!element || element.type === "group") {
        return [];
      }
      const frame = element.frame;
      const nextWidth = frame.width * scaleX;
      const nextHeight = frame.height * scaleY;
      return [
        {
          id,
          patch: {
            frame: this.validateFrame({
              x: bounds.x + (frame.x + frame.width / 2 - bounds.x) * scaleX - nextWidth / 2,
              y: bounds.y + (frame.y + frame.height / 2 - bounds.y) * scaleY - nextHeight / 2,
              width: nextWidth,
              height: nextHeight,
            }),
          },
        },
      ];
    });
    const updated = this.elements.updateElements(updates);
    if (scaleX !== 1 || scaleY !== 1) {
      updated.forEach((element) =>
        this.creationDefaults.remember(element.type, { frame: element.frame }),
      );
    }
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
    const internalConnectors = this.findRelatedElementIds(selected);
    const items = [...new Set([...selected, ...internalConnectors])];
    if (items.some((id) => !this.elements.hasElement(id))) {
      throw new Error("Grouped objects must exist");
    }
    if (items.length < 2) {
      throw new Error("Grouping requires at least two objects");
    }
    const parents = new Set(items.map((id) => this.getSelectableParentId(id)));
    if (parents.size !== 1) {
      throw new Error("Grouped objects must share one parent");
    }
    const bounds =
      unionFrames(items.flatMap((id) => this.getElementBounds(id) ?? [])) ?? DEFAULT_FRAME;
    const parentId = this.getSelectableParentId(items[0]!) ?? null;
    const parent = parentId ? this.getElement(parentId) : undefined;
    // A Panel exposes its root's children, but excludes the root element itself.
    const siblings = parent?.childIds ?? this.elements.getRootIds();
    const selectedIds = new Set(items);
    const ordered = siblings.filter((id) => selectedIds.has(id));
    const group = this.runtime.history.batchUpdates(() => {
      const group = this.elements.insertElement({
        type: "group",
        frame: bounds,
        zIndex: Math.max(0, ...items.map((item) => this.getElement(item)?.zIndex ?? 0)),
        props: { title: `Group ${this.getGroups().length + 1}` },
      });
      if (this.reactPanel) {
        this.reactPanel.elements.moveElements(
          [group.id],
          parentId === null
            ? { root: true, beforeId: ordered[0] }
            : { parentId, beforeId: ordered[0] },
        );
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
    const selected = this.selection
      .get()
      .items.filter((id) => this.getElement(id)?.type === "group");
    const children: string[] = [];
    this.runtime.history.batchUpdates(() =>
      selected.forEach((id) => {
        const group = this.getGroupRecord(id);
        if (!group) {
          return;
        }
        children.push(...group.children);
        this.elements.removeElementAndPromoteChildren(id);
      }),
    );
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
    const entries = this.selection.get().items.flatMap((id) => {
      const bounds = this.getElementBounds(id);
      return bounds ? [{ id, bounds }] : [];
    });
    const outer = unionFrames(entries.map(({ bounds }) => bounds));
    if (!outer || entries.length < 2) {
      return;
    }
    this.runtime.history.batchUpdates(() =>
      entries.forEach(({ id, bounds }) => {
        let dx = 0;
        if (mode === "left") {
          dx = outer.x - bounds.x;
        } else if (mode === "center") {
          dx = outer.x + outer.width / 2 - bounds.width / 2 - bounds.x;
        } else if (mode === "right") {
          dx = outer.x + outer.width - bounds.width - bounds.x;
        }
        let dy = 0;
        if (mode === "top") {
          dy = outer.y - bounds.y;
        } else if (mode === "middle") {
          dy = outer.y + outer.height / 2 - bounds.height / 2 - bounds.y;
        } else if (mode === "bottom") {
          dy = outer.y + outer.height - bounds.height - bounds.y;
        }
        if (dx || dy) {
          this.translateLeaves([id], dx, dy);
        }
      }),
    );
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
    const entries = this.selection
      .get()
      .items.flatMap((id) => {
        const bounds = this.getElementBounds(id);
        return bounds ? [{ id, bounds }] : [];
      })
      .sort((a, b) => (axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y));
    if (entries.length < 3) {
      return;
    }
    const first = entries[0]!.bounds;
    const last = entries.at(-1)!.bounds;
    const occupied = entries.reduce(
      (sum, entry) => sum + (axis === "horizontal" ? entry.bounds.width : entry.bounds.height),
      0,
    );
    const span =
      axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
    const gap = (span - occupied) / (entries.length - 1);
    let cursor = axis === "horizontal" ? first.x : first.y;
    this.runtime.history.batchUpdates(() =>
      entries.forEach(({ id, bounds }) => {
        const delta = cursor - (axis === "horizontal" ? bounds.x : bounds.y);
        if (delta) {
          this.translateLeaves(
            [id],
            axis === "horizontal" ? delta : 0,
            axis === "vertical" ? delta : 0,
          );
        }
        cursor += (axis === "horizontal" ? bounds.width : bounds.height) + gap;
      }),
    );
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
    const selected = new Set([...this.getLeafIds(items), ...this.findRelatedElementIds(items)]);
    const layers = this.elements
      .getElementNodes()
      .filter((element) => element.type !== "group")
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((element) => element.id);
    const moving = layers.filter((id) => selected.has(id));
    const stationary = layers.filter((id) => !selected.has(id));
    const frontmost = Math.max(...moving.map((id) => layers.indexOf(id)));
    const current = stationary.filter((id) => layers.indexOf(id) < frontmost).length;
    let insertion: number;
    if (direction === "front") {
      insertion = stationary.length;
    } else if (direction === "back") {
      insertion = 0;
    } else if (direction === "forward") {
      insertion = Math.min(stationary.length, current + 1);
    } else {
      insertion = Math.max(0, current - 1);
    }
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
    const blocks = items.filter((id) => this.getElement(id)?.type === "block");
    if (!blocks.length) {
      return;
    }
    this.elements.updateElements(
      blocks.map((id) => ({ id, patch: { props: { autoHeight: enabled } } })),
    );
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
    const leaves = this.getLeafIds(selected);
    const blockIds = leaves.flatMap((id) => {
      const element = this.getElement(id);
      return element?.type === "block" ? blockIdsOf(element, this.getRootBlockIds()) : [];
    });
    const reactPanel = this.reactPanel;
    if (reactPanel && blockIds.some((id) => !reactPanel.blocks.canRemove(id))) {
      return;
    }
    this.runtime.history.batchUpdates(() => {
      leaves.forEach((id) => {
        const element = this.getElement(id);
        if (element?.type === "block") {
          blockIdsOf(element, this.getRootBlockIds()).forEach((blockId) =>
            this.runtime.blocks.removeBlock(blockId),
          );
        }
      });
      this.elements.removeElements([
        ...new Set([...leaves, ...selected.filter((id) => this.getElement(id)?.type === "group")]),
      ]);
    });
  }

  /**
   * Expands groups recursively to distinct existing leaf elements.
   *
   * @param items - Element or group IDs; duplicates and missing IDs are ignored.
   * @returns Leaf IDs represented by an element or nested group selection.
   */
  getLeaves(items: readonly string[]): string[] {
    return this.getLeafIds(items);
  }
  /**
   * Resolves parentage without exposing an excluded panel container.
   *
   * @param id - Element ID to locate.
   * @returns Direct parent within this panel, or undefined for a panel root or missing element.
   */
  getParentId(id: string): string | undefined {
    return this.getSelectableParentId(id);
  }

  /**
   * Reads the active canvas selection for this occurrence.
   *
   * @returns Detached active canvas selection.
   */
  getSelection() {
    return this.selection.get();
  }

  /**
   * Replaces the active canvas selection with validated element references.
   *
   * @param value - Array of existing element IDs within this instance’s element scope.
   * @throws If the value is not an array of strings or any element is absent or outside the panel.
   */
  select(value: unknown): void {
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== "string" || !this.getElement(id))
    ) {
      throw new Error("Edgeless selection must contain existing element IDs");
    }
    this.selection.set(value as string[]);
  }

  /**
   * Clears the active canvas selection for the receiving occurrence.
   *
   * Persisted elements, local tools, and property previews remain unchanged.
   */
  clearSelection(): void {
    this.selection.clear();
  }

  /**
   * Duplicates the active selection through the clipboard copy/paste pipeline.
   *
   * The clipboard pipeline allocates new identities and updates the selection.
   * @returns Complete top-level elements created from the active selection, or an empty array for an empty selection.
   */
  duplicateSelection(): EditorElementNode[] {
    const items = this.selection.get().items;
    if (!items.length) {
      return [];
    }
    const created = this.pasteClipboardBundle(
      this.createClipboardBundle(items, "duplicate"),
      "duplicate",
    );
    const createdById = new Map(created.map((element) => [element.id, element]));
    return this.selection.get().items.flatMap((id) => createdById.get(id) ?? []);
  }

  // Resolve through this controller so panel proxies keep their Panel boundary.
  /**
   * Creates a geometry resolver over the current element and rotation readers.
   *
   * @returns A resolver that reads current document geometry when used.
   */
  private get geometry() {
    return new ElementGeometry(
      (id) => this.getElement(id),
      (id) => this.getNormalizedRotation(id),
    );
  }
  /**
   * Reads the root blocks visible in the operation's scope.
   *
   * @returns Panel root IDs when mounted, otherwise document root IDs.
   */
  private getRootBlockIds() {
    return this.reactPanel ? this.reactPanel.blocks.getRootIds() : this.runtime.blocks.getRootIds();
  }

  /**
   * Advances the operation revision and synchronously notifies a snapshot of listeners.
   */
  private emit(): void {
    this.revision += 1;
    this.listeners.emit("changed");
  }

  /**
   * Combines persisted properties, registered defaults, and a valid local preview without changing the document.
   *
   * @param element - Element snapshot or DOM host used by the operation.
   * @returns Detached rendered node; invalid previews fall back to persisted properties and defaults.
   */
  private getRenderedElementSnapshot(element: EditorElementNode): EditorElementNode {
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
   * Remembers final normalized values only for fields requested by a successful edit.
   *
   * @param element - Committed element returned by the manager.
   * @param patch - Requested property keys; unrelated old styles are not remembered.
   * @param frame - Requested dimensions, if this edit also changed geometry.
   * @returns Updates the surface's declared creation settings.
   */
  private rememberUpdatedProperties(
    element: EditorElementNode,
    patch: Record<string, unknown>,
    frame?: Partial<VisualFrame>,
  ): void {
    this.creationDefaults.remember(element.type, {
      props: Object.fromEntries(Object.keys(patch).map((key) => [key, element.props[key]])),
      frame: frame
        ? Object.fromEntries(
            Object.keys(frame).map((key) => [key, element.frame[key as keyof VisualFrame]]),
          )
        : undefined,
    });
  }

  /**
   * Shares defaults and pure geometry preparation between previews and insertion.
   *
   * Persisted insertion owns its own single validation pass. Explicit input wins
   * over type and group memory; behavior.create receives the complete candidate.
   *
   * @param input - Detached creation request, optionally supplying geometry and properties.
   * @returns Prepared input with a complete frame and copied properties.
   * @throws If the type is unregistered or its creation behavior rejects the input.
   */
  private prepareCreationInput(
    input: CreateElementInput,
  ): EditorElementInput & { frame: VisualFrame; props: Record<string, unknown> } {
    const registration = this.runtime.elementTypes.get(input.type);
    if (!registration) {
      throw new Error(`Element type ${input.type} is not registered`);
    }
    const resolvedSettings = this.creationDefaults.get({ type: input.type });
    const preparedInput = {
      ...copy(input),
      frame: this.validateFrame({ ...DEFAULT_FRAME, ...resolvedSettings.frame, ...input.frame }),
      zIndex: input.zIndex ?? 0,
    };
    // A type can derive defaults for this input from the resolved session settings.
    // This optional function differs from a toolbar group's creationDefaults object,
    // which supplies initial settings; absent results leave the session values unchanged.
    const creationProperties =
      registration.behavior?.creationDefaults?.(resolvedSettings.props ?? {}, preparedInput) ??
      resolvedSettings.props;
    const props = copy({ ...creationProperties });
    for (const [key, value] of Object.entries(input.props ?? {})) {
      if (value !== undefined || !(key in props)) {
        props[key] = copy(value);
      }
    }
    const inputWithProperties = { ...preparedInput, props };
    const preparedCreation =
      registration.behavior?.create?.(inputWithProperties, this.reactPanel ?? this.documentPanel) ??
      inputWithProperties;
    return {
      ...preparedCreation,
      frame: this.validateFrame({ ...DEFAULT_FRAME, ...preparedCreation.frame }),
      props: preparedCreation.props ?? {},
    };
  }

  /**
   * Copies the selected elements through the shared clipboard converter pipeline.
   *
   * @param items - Selected element IDs to copy or transform.
   * @param operation - Clipboard operation associated with conversion; defaults are specified by the method signature.
   * @returns Clipboard bundle for the requested operation, defaulting to copy.
   */
  private createClipboardBundle(
    items: readonly string[],
    operation: "copy" | "cut" | "duplicate" = "copy",
  ): ClipboardBundle {
    return this.runtime.clipboard.copyElements(items, this.reactPanel ?? this.runtime, operation);
  }

  /**
   * Pastes a bundle without merging text and reads the resulting selection.
   *
   * @param bundle - Clipboard bundle containing source blocks, elements, and identity metadata.
   * @param operation - Clipboard operation associated with conversion; defaults are specified by the method signature.
   * @returns Existing element nodes selected after paste or duplicate.
   */
  private pasteClipboardBundle(
    bundle: ClipboardBundle,
    operation: "paste" | "duplicate" = "paste",
  ): EditorElementNode[] {
    this.runtime.clipboard.paste(
      { bundle, placement: { mergeText: false } },
      this.reactPanel ?? this.runtime,
      operation,
    );
    return this.selection.get().items.flatMap((id) => this.elements.getElementNode(id) ?? []);
  }

  /**
   * Translates reachable leaf frames within a history batch, omitting missing elements.
   *
   * @param items - Selected element IDs to copy or transform.
   * @param dx - Horizontal translation in canvas coordinates.
   * @param dy - Vertical translation in canvas coordinates.
   */
  private translateLeaves(items: readonly string[], dx: number, dy: number): void {
    this.runtime.history.batchUpdates(() =>
      this.getLeafIds(items).forEach((id) => {
        const frame = this.getElement(id)?.frame;
        if (frame) {
          this.updateElementFrame(id, { ...frame, x: frame.x + dx, y: frame.y + dy });
        }
      }),
    );
  }

  /**
   * Expands group selections into existing leaf IDs without revisiting IDs.
   *
   * @param items - Selected element IDs to copy or transform.
   * @param visited - IDs already visited; updated during recursive group expansion.
   * @returns Unique reachable leaf IDs; missing elements are omitted.
   */
  private getLeafIds(items: readonly string[], visited = new Set<string>()): string[] {
    return items.flatMap((id): string[] => {
      if (visited.has(id)) {
        return [];
      }
      visited.add(id);
      const group = this.getGroupRecord(id);
      if (group) {
        return this.getLeafIds(group.children, visited);
      }
      return this.getElement(id) ? [id] : [];
    });
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
  private findRelatedElementIds(items: readonly string[]): string[] {
    const contained = new Set(items);
    const collect = (id: string): void => {
      this.getGroupRecord(id)?.children.forEach((child) => {
        if (contained.has(child)) {
          return;
        }
        contained.add(child);
        collect(child);
      });
    };
    items.forEach(collect);
    const parents = new Set(items.map((id) => this.getSelectableParentId(id)));
    const parentId = parents.size === 1 ? [...parents][0] : undefined;
    if (parents.size !== 1) {
      return [];
    }
    return this.elements
      .getElementNodes()
      .filter((element) => {
        if (contained.has(element.id) || this.getSelectableParentId(element.id) !== parentId) {
          return false;
        }
        const references = this.runtime.elementTypes
          .get(element.type)
          ?.behavior?.relatedElements?.(element);
        return Boolean(references?.length && references.every((id) => contained.has(id)));
      })
      .map((element) => element.id);
  }
  /**
   * Computes an element's visual bounds using current document geometry.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Axis-aligned bounds, or undefined when unavailable.
   */
  private getElementBounds(id: string): VisualFrame | undefined {
    return this.geometry.bounds(id);
  }

  /**
   * Validates and writes an existing non-group element's frame; missing elements and groups are ignored.
   *
   * @param id - Stable ID of the record or registration to access.
   * @param frame - Requested element frame in canvas coordinates.
   * @throws If the new frame has non-finite coordinates or non-positive dimensions.
   */
  private updateElementFrame(id: string, frame: VisualFrame): void {
    const element = this.getElement(id);
    if (!element || element.type === "group") {
      return;
    }
    this.elements.updateElement(id, { frame: this.validateFrame(frame) });
  }
  /**
   * Reads a selectable parent while stopping at the panel boundary.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Parent element ID, or undefined outside the selectable subtree.
   */
  private getSelectableParentId(id: string): string | undefined {
    const parent = this.elements.getParentId(id);
    // Stop group selection and connector attachment at the Panel boundary.
    return parent && this.elements.hasElement(parent) ? parent : undefined;
  }

  /**
   * Reads normalized rotation unless the registered element owns absolute geometry.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Rotation in degrees, defaulting to zero.
   */
  private getNormalizedRotation(id: string): number {
    const element = this.getElement(id);
    return !this.runtime.elementTypes.get(element?.type ?? "")?.behavior?.absoluteGeometry &&
      typeof element?.props.rotation === "number"
      ? normalizeRotation(element.props.rotation)
      : 0;
  }

  /**
   * Looks up the current persisted element node within the operation's scope.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Element node, or undefined when missing.
   */
  private getElement(id: string): EditorElementNode | undefined {
    return this.elements.getElementNode(id);
  }
  /**
   * Reads the element node with local rendering previews applied.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Rendered node, or undefined when missing.
   */
  private getVisual(id: string): EditorElementNode | undefined {
    return this.getRenderedElement(id);
  }
  /**
   * Projects an existing group node into its visual group record.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Group ID, title, and children, or undefined for other or missing elements.
   */
  private getGroupRecord(id: string): VisualGroup | undefined {
    const element = this.getElement(id);
    if (element?.type !== "group") {
      return undefined;
    }
    return {
      id,
      title: typeof element.props.title === "string" ? element.props.title : "Group",
      children: element.childIds,
    };
  }

  /**
   * Checks finite frame coordinates and positive dimensions and returns a detached frame.
   *
   * @param value - Frame whose coordinates and positive dimensions must be validated.
   * @returns Frame containing only x, y, width, and height.
   * @throws If any coordinate is non-finite or a dimension is non-positive.
   */
  private validateFrame(value: VisualFrame): VisualFrame {
    if (
      ![value.x, value.y, value.width, value.height].every(Number.isFinite) ||
      value.width <= 0 ||
      value.height <= 0
    ) {
      throw new Error("Visual frame requires finite positive geometry");
    }
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }
}
