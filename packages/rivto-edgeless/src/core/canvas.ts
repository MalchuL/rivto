import { elementBounds, intersects, sameRect } from "../utils/geometry";
import { Store, type CanvasSnapshot } from "../utils/store";
import type {
  Camera,
  CanvasElement,
  CanvasOptions,
  CanvasTransform,
  Point,
  Rect,
  TransformChange,
  TransformKind,
} from "../types/canvas";

/** Independent viewport, visibility and gesture state over consumer-owned elements. */
export class Canvas {
  private readonly snappingStore = new Store({ grid: 20, snap: true, align: true });
  private readonly cameraStore = new Store<Camera>({ x: 0, y: 0, zoom: 1 });
  private readonly visibleStore = new Store<readonly string[]>([]);
  private readonly selectionStore = new Store<readonly string[]>([]);
  private readonly transformStore = new Store<CanvasTransform | null>(null);
  readonly camera: CanvasSnapshot<Camera> = this.cameraStore;
  readonly visible: CanvasSnapshot<readonly string[]> = this.visibleStore;
  readonly selection: CanvasSnapshot<readonly string[]> = this.selectionStore;
  readonly transform: CanvasSnapshot<CanvasTransform | null> = this.transformStore;
  readonly snapping: CanvasSnapshot<{ grid: number; snap: boolean; align: boolean }> =
    this.snappingStore;

  private readonly elementById = new Map<string, CanvasElement>();
  private readonly elementListStore = new Store<readonly CanvasElement[]>([]);
  readonly elements: CanvasSnapshot<readonly CanvasElement[]> = this.elementListStore;
  private readonly bounds = new Map<string, Rect>();
  private readonly elementStores = new Map<string, Store<CanvasElement | undefined>>();
  private readonly pins = new Map<string, number>();
  private size = { width: 0, height: 0 };
  private committing = false;
  /** Stable stacking order; geometry and camera updates do not invalidate it. */
  private paintOrder: readonly string[] = [];
  private paintOrderDirty = false;

  /**
   * Creates isolated canvas state; no DOM or document subscriptions are installed.
   *
   * @param options - Scale limits, overscan and consumer callbacks.
   * @throws If limits or overscan are invalid.
   */
  constructor(readonly options: CanvasOptions = {}) {
    const { minZoom = 0.1, maxZoom = 4, overscan = 200 } = options;
    if (
      !(minZoom > 0) ||
      !Number.isFinite(maxZoom) ||
      maxZoom < minZoom ||
      !Number.isFinite(overscan) ||
      overscan < 0
    ) {
      throw new RangeError("Invalid canvas limits");
    }
  }

  /**
   * Updates shared grid and object-alignment preferences for transform controls.
   *
   * @param settings - Nonnegative grid spacing in world units and enabled flags.
   * @returns Snapping observers reflect the new settings.
   * @throws If grid spacing is negative or not finite.
   */
  setSnapping(settings: { grid: number; snap: boolean; align: boolean }): void {
    if (!Number.isFinite(settings.grid) || settings.grid < 0) {
      throw new RangeError("Invalid snap grid");
    }
    const current = this.snappingStore.get();
    if (
      current.grid !== settings.grid ||
      current.snap !== settings.snap ||
      current.align !== settings.align
    ) {
      this.snappingStore.set({ ...settings });
    }
  }

  /**
   * Reads a projected element, including active preview geometry.
   *
   * @param id - Stable consumer ID.
   * @returns Current geometry or undefined when removed.
   */
  getElement(id: string): CanvasElement | undefined {
    return this.elementStore(id).get();
  }

  /**
   * Returns the per-element observable without subscribing to unrelated changes.
   *
   * @param id - Stable consumer ID.
   * @returns Stable store, whose snapshot is undefined for a missing element.
   */
  elementStore(id: string): CanvasSnapshot<CanvasElement | undefined> {
    let store = this.elementStores.get(id);
    if (!store) {
      const source = this.elementById.get(id);
      const preview = this.transformStore.get()?.changes.find((change) => change.id === id);
      store = new Store(source && preview ? { ...source, ...preview } : source);
      this.elementStores.set(id, store);
    }
    return store;
  }

  /**
   * Replaces the complete projection while preserving unchanged object identities.
   *
   * @param elements - Current consumer-owned elements with unique IDs.
   * @returns Visibility and affected subscribers reflect the new source.
   * @throws If element geometry is invalid or IDs repeat.
   */
  setElements(elements: readonly CanvasElement[]): void {
    const ids = new Set(elements.map((element) => element.id));
    if (ids.size !== elements.length) {
      throw new Error("Duplicate canvas element ID");
    }
    this.updateElements(
      elements,
      [...this.elementById.keys()].filter((id) => !ids.has(id)),
    );
  }

  /**
   * Applies a batch of projected replacements and removals.
   *
   * External geometry changes to active participants cancel their preview. Source
   * updates during the synchronous commit callback are accepted as its result.
   *
   * @param updates - Full element replacements; omitted elements remain unchanged.
   * @param removed - IDs to remove before applying replacements.
   * @returns Element stores and visibility reflect the batch.
   * @throws If any supplied geometry is invalid; validation precedes mutation.
   */
  updateElements(updates: readonly CanvasElement[], removed: readonly string[] = []): void {
    for (const element of updates) {
      this.validate(element);
    }
    const active = this.transformStore.get();
    if (
      active &&
      !this.committing &&
      active.changes.some(
        ({ id }) =>
          removed.includes(id) ||
          updates.some((next) => next.id === id && this.geometryChanged(next)),
      )
    ) {
      this.cancelTransform();
    }
    let changed = false;
    for (const id of removed) {
      if (this.elementById.delete(id)) {
        changed = true;
        this.paintOrderDirty = true;
      }
      this.bounds.delete(id);
      this.elementStores.get(id)?.set(undefined);
    }
    for (const next of updates) {
      const previous = this.elementById.get(next.id);
      if (previous && this.sameElement(previous, next)) {
        continue;
      }
      changed = true;
      if (!previous || previous.zIndex !== next.zIndex) {
        this.paintOrderDirty = true;
      }
      this.elementById.set(next.id, next);
      this.bounds.set(next.id, elementBounds(next));
      const preview = this.transformStore.get()?.changes.find((change) => change.id === next.id);
      this.elementStores
        .get(next.id)
        ?.set(preview && !this.committing ? { ...next, ...preview } : next);
    }
    if (!changed) {
      return;
    }
    this.elementListStore.set([...this.elementById.values()]);
    this.setSelection(this.selectionStore.get().filter((id) => this.elementById.has(id)));
    this.refreshVisible();
  }

  /**
   * Updates viewport dimensions in CSS pixels without changing the camera.
   *
   * @param width - Finite nonnegative inner width.
   * @param height - Finite nonnegative inner height.
   * @returns The visible set is refreshed.
   * @throws If either dimension is invalid.
   */
  setViewport(width: number, height: number): void {
    if (![width, height].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new RangeError("Invalid viewport");
    }
    if (this.size.width === width && this.size.height === height) {
      return;
    }
    this.size = { width, height };
    this.refreshVisible();
  }

  /**
   * Replaces camera translation and clamps scale to the configured limits.
   *
   * @param camera - Translation in viewport pixels and positive zoom.
   * @returns Camera subscribers and visibility are updated once.
   * @throws If a coordinate is not finite or scale is nonpositive.
   */
  setCamera(camera: Camera): void {
    if (![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom <= 0) {
      throw new RangeError("Invalid camera");
    }
    const zoom = Math.max(
      this.options.minZoom ?? 0.1,
      Math.min(this.options.maxZoom ?? 4, camera.zoom),
    );
    const previous = this.cameraStore.get();
    if (camera.x === previous.x && camera.y === previous.y && zoom === previous.zoom) {
      return;
    }
    this.cameraStore.set({ ...camera, zoom });
    this.refreshVisible();
  }

  /**
   * Zooms around a viewport-local point, preserving the world point underneath it.
   *
   * @param zoom - Requested positive scale.
   * @param anchor - Viewport pixels; defaults to its center.
   * @returns Camera and visibility reflect the clamped zoom.
   */
  zoomAt(zoom: number, anchor: Point = { x: this.size.width / 2, y: this.size.height / 2 }): void {
    const world = this.toWorld(anchor);
    const next = Math.max(this.options.minZoom ?? 0.1, Math.min(this.options.maxZoom ?? 4, zoom));
    this.setCamera({ x: anchor.x - world.x * next, y: anchor.y - world.y * next, zoom: next });
  }

  /**
   * Converts viewport-local pixels to world coordinates.
   *
   * @param point - Position relative to the viewport's inner origin.
   * @returns Unscaled world position.
   */
  toWorld(point: Point): Point {
    const camera = this.cameraStore.get();
    return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
  }

  /**
   * Converts world coordinates to viewport-local pixels.
   *
   * @param point - World position.
   * @returns Scaled and translated viewport position.
   */
  toViewport(point: Point): Point {
    const camera = this.cameraStore.get();
    return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
  }

  /**
   * Queries full geometry, including elements currently unmounted by virtualization.
   *
   * @param rect - World rectangle with inclusive edges.
   * @returns Intersecting selectable IDs in source order.
   */
  query(rect: Rect): string[] {
    return [...this.bounds]
      .filter(
        ([id, bounds]) =>
          this.elementById.get(id)?.selectable !== false && intersects(bounds, rect),
      )
      .map(([id]) => id);
  }

  /**
   * Reads full projected geometry for snapping and consumer policies.
   *
   * @returns Source elements, without applying transient preview patches.
   */
  getElements(): readonly CanvasElement[] {
    return this.elementListStore.get();
  }

  /**
   * Projects externally owned selection without emitting a user request.
   *
   * @param ids - Selected IDs; duplicates and missing elements are removed.
   * @returns Selection observers are notified only when membership or order changes.
   */
  setSelection(ids: readonly string[]): void {
    const next = [...new Set(ids)].filter((id) => this.elementById.has(id));
    if (!this.sameIds(next, this.selectionStore.get())) {
      this.selectionStore.set(next);
    }
  }

  /**
   * Requests a selection change from direct canvas interaction.
   *
   * @param ids - IDs to select.
   * @returns Local selection and the consumer have been updated.
   */
  select(ids: readonly string[]): void {
    this.setSelection(ids);
    this.options.onSelectionChange?.(this.selectionStore.get());
  }

  /**
   * Keeps elements mounted independently of visibility until the returned cleanup runs.
   *
   * @param ids - Participants required for focus, measurement or an active gesture.
   * @returns Idempotent release of this pin scope; other scopes remain active.
   */
  pin(ids: readonly string[]): () => void {
    const unique = [...new Set(ids)];
    for (const id of unique) {
      this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
    }
    this.refreshVisible();
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      for (const id of unique) {
        const count = (this.pins.get(id) ?? 1) - 1;
        if (count) {
          this.pins.set(id, count);
        } else {
          this.pins.delete(id);
        }
      }
      this.refreshVisible();
    };
  }

  /**
   * Checks whether every requested object supports a whole-selection transform.
   *
   * Missing objects and empty selections are rejected. Capabilities default to
   * enabled independently; disabling resize does not disable movement or rotation.
   * Groups use their projected capability policy rather than DOM descendants.
   *
   * @param kind - Requested move, resize or rotation operation.
   * @param ids - Selected source identities; defaults to the current selection.
   * @returns True when all requested objects exist and permit this operation.
   */
  canTransform(kind: TransformKind, ids: readonly string[] = this.selectionStore.get()): boolean {
    return (
      ids.length > 0 && ids.every((id) => this.allowsTransform(this.elementById.get(id), kind))
    );
  }

  /**
   * Captures source geometry for one whole-object gesture.
   *
   * @param kind - Move, resize or rotate.
   * @param ids - Concrete participants resolved by the consumer.
   * @returns Whether any eligible participant was captured.
   */
  beginTransform(kind: TransformKind, ids: readonly string[] = this.selectionStore.get()): boolean {
    this.cancelTransform();
    const changes = [...new Set(ids)].flatMap((id) => {
      const node = this.elementById.get(id);
      if (!node || !this.allowsTransform(node, kind)) {
        return [];
      }
      return [{ id, frame: node.frame, rotation: node.rotation }];
    });
    if (!changes.length) {
      return false;
    }
    const gesture = { kind, changes };
    this.transformStore.set(gesture);
    this.refreshVisible();
    try {
      this.options.onTransformStart?.(gesture);
    } catch (error) {
      this.clearTransform();
      throw error;
    }
    return true;
  }

  /**
   * Publishes temporary geometry without modifying the source projection.
   *
   * @param changes - Current geometry for captured participants.
   * @returns Preview subscribers and consumer decorations are updated.
   */
  previewTransform(changes: readonly TransformChange[]): void {
    const active = this.transformStore.get();
    if (!active) {
      return;
    }
    const allowed = new Set(active.changes.map(({ id }) => id));
    const next = changes.filter(({ id }) => allowed.has(id));
    for (const change of next) {
      const source = this.elementById.get(change.id)!;
      this.validate({ ...source, ...change });
    }
    const gesture = {
      kind: active.kind,
      changes: active.changes.map((change) => next.find(({ id }) => id === change.id) ?? change),
    };
    this.transformStore.set(gesture);
    for (const change of gesture.changes) {
      this.elementStores.get(change.id)?.set({ ...this.elementById.get(change.id)!, ...change });
    }
    try {
      this.options.onTransformPreview?.(gesture);
    } catch (error) {
      this.clearTransform();
      throw error;
    }
  }

  /**
   * Delivers one final batch to the consumer and removes all temporary geometry.
   *
   * @returns Whether a gesture was delivered and not explicitly rejected.
   * @throws Consumer errors propagate after restoring source geometry.
   */
  commitTransform(): boolean {
    const active = this.transformStore.get();
    if (!active) {
      return false;
    }
    if (
      !active.changes.some((change) => {
        const source = this.elementById.get(change.id);
        return (
          source && (!sameRect(source.frame, change.frame) || source.rotation !== change.rotation)
        );
      })
    ) {
      this.clearTransform();
      return false;
    }
    this.committing = true;
    try {
      return this.options.onTransformCommit?.(active) !== false;
    } finally {
      this.committing = false;
      this.clearTransform();
    }
  }

  /**
   * Discards the current gesture without requesting a source update.
   *
   * @returns Consumer previews and temporary geometry are cleared.
   */
  cancelTransform(): void {
    const active = this.transformStore.get();
    if (!active) {
      return;
    }
    try {
      this.options.onTransformCancel?.(active);
    } finally {
      this.clearTransform();
    }
  }

  /**
   * Releases observers and transient state when the owning view is destroyed.
   *
   * @returns No subscriptions, pins or active previews remain.
   * @throws Consumer cancellation errors propagate after observers are released.
   */
  dispose(): void {
    try {
      this.cancelTransform();
    } finally {
      this.pins.clear();
      for (const store of this.elementStores.values()) {
        store.clear();
      }
      this.elementListStore.clear();
      this.snappingStore.clear();
      this.cameraStore.clear();
      this.visibleStore.clear();
      this.selectionStore.clear();
      this.transformStore.clear();
    }
  }

  /**
   * Restores source snapshots after a gesture ends.
   *
   * @returns Preview and forced gesture visibility are released.
   */
  private clearTransform(): void {
    const active = this.transformStore.get();
    this.transformStore.set(null);
    for (const { id } of active?.changes ?? []) {
      this.elementStores.get(id)?.set(this.elementById.get(id));
    }
    this.refreshVisible();
  }

  /**
   * Recomputes mounted membership using cached world bounds, never DOM layout.
   *
   * @returns Visible subscribers are notified only when ordered membership changes.
   */
  private refreshVisible(): void {
    const { x, y, zoom } = this.cameraStore.get();
    const margin = this.options.overscan ?? 200;
    const rect = {
      x: (-x - margin) / zoom,
      y: (-y - margin) / zoom,
      width: (this.size.width + margin * 2) / zoom,
      height: (this.size.height + margin * 2) / zoom,
    };
    const active = new Set(this.transformStore.get()?.changes.map(({ id }) => id));
    // shortcut: scan cached bounds; add an index only if profiling shows geometry queries dominate.
    const next: string[] = [];
    for (const id of this.getPaintOrder()) {
      const node = this.elementById.get(id)!;
      if (
        node.render !== false &&
        (this.pins.has(id) || active.has(id) || intersects(this.bounds.get(id)!, rect))
      ) {
        next.push(id);
      }
    }
    if (!this.sameIds(next, this.visibleStore.get())) {
      this.visibleStore.set(next);
    }
  }

  /**
   * Reuses stacking order until membership or an element's z-index changes.
   *
   * Equal z-indices retain source insertion order, including remove/reinsert batches.
   * Geometry, viewport and pin changes only filter this ordering and never sort it.
   *
   * @returns IDs in paint order, rebuilt lazily after a relevant source mutation.
   */
  private getPaintOrder(): readonly string[] {
    if (this.paintOrderDirty) {
      this.paintOrder = [...this.elementById.values()]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(({ id }) => id);
      this.paintOrderDirty = false;
    }
    return this.paintOrder;
  }

  /**
   * Compares ordered identity lists to retain stable external snapshots.
   *
   * @param a - Candidate IDs.
   * @param b - Previous IDs.
   * @returns Whether ordered membership is equal.
   */
  private sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
  }

  /**
   * Detects source geometry changes that invalidate a captured gesture.
   *
   * @param next - Incoming projected element.
   * @returns Whether its frame or rotation differs from the captured source.
   */
  private geometryChanged(next: CanvasElement): boolean {
    const previous = this.elementById.get(next.id);
    return (
      !previous || !sameRect(previous.frame, next.frame) || previous.rotation !== next.rotation
    );
  }

  /**
   * Compares all public projection fields to preserve stable element snapshots.
   *
   * @param a - Previous projection.
   * @param b - Incoming projection.
   * @returns Whether rendering and interaction geometry are unchanged.
   */
  private sameElement(a: CanvasElement, b: CanvasElement): boolean {
    return (
      !this.geometryChanged(b) &&
      sameRect(elementBounds(a), elementBounds(b)) &&
      a.zIndex === b.zIndex &&
      a.render === b.render &&
      a.selectable === b.selectable &&
      a.movable === b.movable &&
      a.resizable === b.resizable &&
      a.rotatable === b.rotatable &&
      a.minSize?.[0] === b.minSize?.[0] &&
      a.minSize?.[1] === b.minSize?.[1]
    );
  }

  /**
   * Rejects invalid geometry before any state or subscriptions are changed.
   *
   * @param node - Candidate projected element.
   * @returns The geometry is finite with nonnegative extents.
   * @throws If identity, bounds, frame, rotation or stacking order is invalid.
   */
  private validate(node: CanvasElement): void {
    for (const rect of [node.frame, elementBounds(node)]) {
      if (
        ![rect.x, rect.y, rect.width, rect.height, node.rotation, node.zIndex].every(
          Number.isFinite,
        ) ||
        rect.width < 0 ||
        rect.height < 0 ||
        !node.id
      ) {
        throw new RangeError("Invalid canvas element geometry");
      }
    }
  }
  /**
   * Resolves an element's capability for one transformation kind.
   *
   * @param element - Current source element; absent identities are rejected.
   * @param kind - Requested transformation.
   * @returns Whether the element permits this operation, defaulting unspecified flags to true.
   */
  private allowsTransform(element: CanvasElement | undefined, kind: TransformKind): boolean {
    if (!element) {
      return false;
    }
    if (kind === "move") {
      return element.movable !== false;
    }
    if (kind === "resize") {
      return element.resizable !== false;
    }
    return element.rotatable !== false;
  }
}

/** Borrowed scene operations; only the owning application may dispose the concrete Canvas. */
export type CanvasApi = Omit<Canvas, "dispose">;
