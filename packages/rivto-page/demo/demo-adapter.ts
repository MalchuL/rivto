import { Listeners } from "@chulane/rivto-utils";
import type { BlockDropDestination } from "../src";
import { BlockSelectionRanges } from "../src/editor/selection/block-selection-ranges";
import type { BlockSelectionSnapshot } from "../src/editor/selection/types";
import { BACKGROUND_COLORS, LIST_TYPES } from "./constants";
import type { BlockEditorAdapter, BlockEditorNodePatch, BlockEditorNodeSnapshot } from "../src";

/** Demo-owned content alongside the structural fields consumed by Page. */
interface DemoNodeSnapshot extends BlockEditorNodeSnapshot {
  readonly text: string;
  readonly width?: number;
}

/** On-demand counters; reading them does not notify the editor. */
export interface DemoMetrics {
  readonly nodeReads: number;
  readonly blockIdsReads: number;
  readonly notifications: number;
  readonly subscriptions: number;
  readonly commandMs: number;
  readonly selectionCommandMs: number;
}

/** In-memory example host; its snapshots outlive view remounts. */
export class DemoAdapter implements BlockEditorAdapter {
  private readonly nodes = new Map<string, DemoNodeSnapshot>();
  /** Keys identify block nodes, selected block IDs, or the block-ids and selection-snapshot channels. */
  private readonly listeners = new Listeners<Record<string, void>>();
  private blockIds: readonly string[] = [];
  private selectionSnapshot: BlockSelectionSnapshot | undefined;
  private parentIds: ReadonlyMap<string, string> | undefined;
  private selectableIds: readonly string[] | undefined;
  private selected = new Set<string>();
  private nodeReads = 0;
  private blockIdsReads = 0;
  private notifications = 0;
  private commandMs = 0;
  private selectionCommandMs = 0;

  readonly blocks = {
    /**
     * Reads the demo's canonical roots, which are also its display list.
     *
     * @returns Stable current root IDs, including an empty list for an empty demo.
     */
    getRootIds: () => this.blockIds,
    /**
     * Resolves the actual parent through a hierarchy-only cached index.
     *
     * @param id - Known or missing demo identity.
     * @returns Parent identity, or undefined for roots and unknown IDs.
     */
    getParentId: (id: string) => this.getParentIds().get(id),
    /**
     * Reads display order without observing node edits.
     *
     * @returns Cached host-selected display IDs.
     */
    getBlockIds: () => {
      this.blockIdsReads += 1;
      return this.blockIds;
    },
    /**
     * Observes display-list changes.
     *
     * @param listener - Callback invoked after display-list replacement.
     * @returns Disposer releasing this observation.
     */
    subscribeBlockIds: (listener: () => void) => this.subscribe("block-ids", listener),
    /**
     * Reads the host's cached own-node snapshot.
     *
     * @param id - Demo node identity.
     * @returns Snapshot, or undefined for an unknown ID.
     */
    getBlockNode: (id: string) => {
      this.nodeReads += 1;
      return this.nodes.get(id);
    },
    /**
     * Observes one ID without subscribing to its descendants.
     *
     * @param id - Demo node identity.
     * @param listener - Callback invoked after this node changes.
     * @returns Disposer releasing this observation.
     */
    subscribeBlockNode: (id: string, listener: () => void) => this.subscribe(id, listener),
    /**
     * Applies Page presentation commands to this in-memory host.
     *
     * This demo has no persistence or undo. Null removes explicit decoration.
     *
     * @param id - Existing demo node identity.
     * @param patch - Presentation fields; omitted fields retain their values.
     * @returns A new snapshot has been published to addressed subscribers.
     * @throws If the node is unknown or the list mode/background value is unsupported.
     */
    updateBlockNode: (id: string, patch: BlockEditorNodePatch) => {
      if (patch.listType != null && !LIST_TYPES.includes(patch.listType)) {
        throw new Error("Unsupported list type");
      }
      if (patch.color && !BACKGROUND_COLORS.some((color) => color.value === patch.color)) {
        throw new Error("Unsupported block background");
      }
      const node = this.requiredNode(id);
      this.publish(id, {
        listType: patch.listType === null ? undefined : (patch.listType ?? node.listType),
        checked: patch.checked ?? node.checked,
        collapsed: patch.collapsed ?? node.collapsed,
        color: patch.color === null ? undefined : (patch.color ?? node.color),
      });
    },
  };

  readonly selection = {
    /**
     * Reads host-owned directed coverage.
     *
     * @returns Current snapshot, or undefined without selection.
     */
    get: () => this.selectionSnapshot,
    /**
     * Publishes coverage and only changed whole-block memberships.
     *
     * @param snapshot - New directed coverage.
     * @returns Host snapshot and addressed observers are updated.
     */
    set: (snapshot: BlockSelectionSnapshot) => this.setSelection(snapshot),
    /**
     * Removes host-owned coverage.
     *
     * @returns Selection is cleared and changed memberships are notified.
     */
    clear: () => this.setSelection(undefined),
    /**
     * Reads cached visible order, excluding collapsed descendants.
     *
     * @returns Canonical selectable IDs for this host occurrence.
     */
    getSelectableBlockIds: () => this.getOrderedBlockIds(),
    /**
     * Reads the host text's UTF-16 length without a node conversion.
     *
     * @param id - Fixture identity.
     * @returns Text length for editable text, or undefined for non-text and missing nodes.
     */
    getTextLength: (id: string) => {
      const node = this.nodes.get(id);
      return node?.type === "text" ? node.text.length : undefined;
    },

    /**
     * Reads whole-block selection from the example host.
     *
     * @param id - Demo node identity.
     * @returns Whether this ID is selected.
     */
    isBlockSelected: (id: string) => this.selected.has(id),
    /**
     * Observes selection of one ID independently of node fields.
     *
     * @param id - Demo node identity.
     * @param listener - Callback invoked when this ID's membership changes.
     * @returns Disposer releasing this observation.
     */
    subscribeBlock: (id: string, listener: () => void) =>
      this.subscribe(`selected:${id}`, listener),
  };

  /**
   * Creates five displayed blocks and one child per repeat without installing subscriptions.
   *
   * @param repeat - Fixture multiplier, clamped by the caller to 1–200.
   * @param example - Host-only fixture choice; omitted values retain the original outline fixture.
   */
  constructor(repeat: number, example: "outline" | "kanban" | "bento" = "outline") {
    if (example !== "outline") {
      this.blockIds = Array.from({ length: repeat }, (_, group) =>
        this.createBoard(example, group),
      );
      return;
    }
    const ids: string[] = [];
    for (let group = 0; group < repeat; group++) {
      for (let index = 0; index < 5; index++) {
        const id = `block-${group * 5 + index + 1}`;
        ids.push(id);
        this.nodes.set(id, {
          id,
          type: index === 4 ? "custom" : "text",
          text: `Text ${id}`,
          childIds: index === 0 ? [`child-${group}`] : [],
          listType: LIST_TYPES[index],
          checked: false,
          collapsed: false,
        });
      }
      const id = `child-${group}`;
      this.nodes.set(id, { id, type: "text", text: "Nested block", childIds: [] });
    }
    this.blockIds = ids;
  }

  /**
   * Reads concrete text without exposing it as a required Page field.
   *
   * @param id - Demo node identity observed through useBlockNode.
   * @returns Current host text.
   * @throws If the ID is unknown.
   */
  getText(id: string): string {
    return this.requiredNode(id).text;
  }

  /**
   * Publishes text from a native input through the example host.
   *
   * @param id - Existing demo node identity.
   * @param text - Current editable value, stored without rich-text conversion.
   * @returns The node's addressed subscribers have been notified.
   * @throws If the ID is unknown.
   */
  setText(id: string, text: string): void {
    this.publish(id, { text });
  }

  /**
   * Observes optional demo selection diagnostics independently of node rendering.
   *
   * @param listener - Callback reading current coverage after changes.
   * @returns Disposer removing diagnostic observation.
   */
  subscribeSelection(listener: () => void): () => void {
    return this.subscribe("selection-snapshot", listener);
  }

  /**
   * Changes one host-owned whole-block selection.
   *
   * @param id - Existing demo ID, or undefined to clear selection.
   * @returns Membership subscribers for the changed IDs have been notified.
   * @throws If a supplied ID is unknown.
   */
  select(id: string | undefined): void {
    if (id) {
      this.requiredNode(id);
    }
    this.setSelection(
      id
        ? {
            type: "selection",
            blocks: [{ id, start: 0, end: -1 }],
            anchorBlockId: id,
            focusBlockId: id,
          }
        : undefined,
    );
  }

  /**
   * Reverses the displayed block order without replacing node snapshots.
   *
   * @returns Display-list subscribers observe the new order.
   */
  reverseBlockIds(): void {
    this.blockIds = [...this.blockIds].reverse();
    this.selectableIds = undefined;
    this.emit("block-ids");
  }

  /**
   * Captures counters without subscribing toolbar chrome to each editor read.
   *
   * @returns Current read/notification counts, active subscriptions, and last synchronous command ms.
   */
  getMetrics(): DemoMetrics {
    const subscriptions = this.listeners.listenerCount;
    return {
      nodeReads: this.nodeReads,
      blockIdsReads: this.blockIdsReads,
      notifications: this.notifications,
      subscriptions,
      commandMs: this.commandMs,
      selectionCommandMs: this.selectionCommandMs,
    };
  }

  /**
   * Resets operation counters without changing document state or subscriptions.
   *
   * @returns Subsequent metrics count only work after this call.
   */
  resetMetrics(): void {
    this.nodeReads = 0;
    this.blockIdsReads = 0;
    this.notifications = 0;
    this.commandMs = 0;
    this.selectionCommandMs = 0;
  }

  /**
   * Reads the host-owned preferred width of one Bento tile.
   *
   * @param id - Tile identity; ordinary text blocks use the example default.
   * @returns Width in CSS pixels, defaulting to 280.
   * @throws If the node is unknown.
   */
  getTileWidth(id: string): number {
    return this.requiredNode(id).width ?? 280;
  }

  /**
   * Updates one example tile width through its existing addressed source.
   *
   * @param id - Existing tile identity.
   * @param width - One of the demo's 240, 280, or 360 CSS pixel choices.
   * @returns A replacement own-node snapshot is published without changing child IDs.
   * @throws If the ID or example width is invalid.
   */
  setTileWidth(id: string, width: number): void {
    if (![240, 280, 360].includes(width)) {
      throw new Error("Unsupported demo width");
    }
    this.publish(id, { width });
  }

  /**
   * Appends one native example column or card without changing displayed root IDs.
   *
   * @param parentId - Existing Kanban board or column owning the new child.
   * @returns Parent and new node snapshots are available to addressed consumers.
   * @throws If the parent is unknown or does not support the example operation.
   */
  appendChild(parentId: string): void {
    const parent = this.requiredNode(parentId);
    if (parent.type !== "demo-kanban" && parent.type !== "demo-column") {
      throw new Error("Unsupported demo parent");
    }
    const id = `${parentId}-added-${parent.childIds.length + 1}`;
    const type = parent.type === "demo-kanban" ? "demo-column" : "text";
    this.nodes.set(id, { id, type, text: "New item", childIds: [] });
    this.publish(parentId, { childIds: [...parent.childIds, id] });
  }

  /**
   * Moves selected sibling groups using model IDs, including unmounted blocks.
   *
   * This demo command has no history. Selected descendants travel with selected
   * ancestors; disjoint sibling groups keep their canonical order. Production
   * hosts delegate equivalent operations to their transactional outline manager.
   *
   * @param outdent - True lifts groups after their parent; false nests under the preceding sibling.
   * @returns Whether at least one eligible group changed parent; selection IDs are retained.
   */
  changeSelectionIndent(outdent: boolean): boolean {
    const started = performance.now();
    const selected = new Set(this.selectionSnapshot?.blocks.map((range) => range.id));
    const parents = this.getParentIds();
    const groups = new Map<string | undefined, string[]>();
    for (const id of this.getOrderedBlockIds(true)) {
      if (!selected.has(id)) {
        continue;
      }
      let ancestor = parents.get(id);
      while (ancestor && !selected.has(ancestor)) {
        ancestor = parents.get(ancestor);
      }
      if (!ancestor) {
        const parent = parents.get(id);
        const group = groups.get(parent) ?? [];
        group.push(id);
        groups.set(parent, group);
      }
    }
    const changed = new Set<string>();
    for (const [parent, ids] of groups) {
      this.moveSiblingGroup(parent, ids, parents, outdent, changed);
    }
    this.selectableIds = undefined;
    this.parentIds = undefined;
    for (const id of changed) {
      this.emit(id);
    }
    this.commandMs = performance.now() - started;
    return changed.size > 0;
  }

  /**
   * Checks demo source identities, cycles and live destination neighbors.
   *
   * Reads hierarchy without publishing nodes or changing selection.
   *
   * @param ids - Unique source roots in canonical order.
   * @param destination - Actual destination parent and optional adjacent neighbors.
   * @returns Whether a move can be committed against the current demo state.
   */
  canMove(ids: readonly string[], destination: BlockDropDestination): boolean {
    const selected = new Set(ids);
    const children =
      destination.parentId === null
        ? this.blockIds
        : this.nodes.get(destination.parentId)?.childIds;
    if (
      !children ||
      !ids.length ||
      selected.size !== ids.length ||
      ids.some((id) => !this.nodes.has(id))
    ) {
      return false;
    }
    const parents = this.getParentIds();
    for (const id of [...ids, ...(destination.parentId === null ? [] : [destination.parentId])]) {
      let ancestor = parents.get(id);
      if (id === destination.parentId && selected.has(id)) {
        return false;
      }
      while (ancestor) {
        if (selected.has(ancestor)) {
          return false;
        }
        ancestor = parents.get(ancestor);
      }
    }
    const index =
      destination.kind === "inside" || destination.nextId === null
        ? children.length
        : children.indexOf(destination.nextId);
    if (
      index < 0 ||
      (destination.kind === "between" && (children[index - 1] ?? null) !== destination.previousId)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Validates and publishes a grouped move without exposing partial hierarchy.
   *
   * This demo has no history. Production hosts use their transactional manager.
   * Sources may have different parents; retained identities include descendants.
   *
   * @param ids - Captured unique roots in canonical source order.
   * @param destination - Actual parent and live insertion neighbors.
   * @returns False for stale sources, gaps or cycles; true after publication.
   */
  moveBlocks(ids: readonly string[], destination: BlockDropDestination): boolean {
    const started = performance.now();
    if (!this.canMove(ids, destination)) {
      return false;
    }
    const selected = new Set(ids);
    const children =
      destination.parentId === null
        ? this.blockIds
        : this.requiredNode(destination.parentId).childIds;
    const parents = this.getParentIds();
    const index =
      destination.kind === "inside" || destination.nextId === null
        ? children.length
        : children.indexOf(destination.nextId);
    const changed = new Set<string>();
    const target = [
      ...children.slice(0, index).filter((id) => !selected.has(id)),
      ...ids,
      ...children.slice(index).filter((id) => !selected.has(id)),
    ];
    for (const source of new Set(ids.map((id) => parents.get(id)))) {
      if (source !== (destination.parentId ?? undefined)) {
        const siblings = source ? this.requiredNode(source).childIds : this.blockIds;
        this.replaceChildren(
          source,
          siblings.filter((id) => !selected.has(id)),
          changed,
        );
      }
    }
    this.replaceChildren(destination.parentId ?? undefined, target, changed);
    this.selectableIds = undefined;
    this.parentIds = undefined;
    this.setSelection(BlockSelectionRanges.createStructuralSelection(ids));
    for (const id of changed) {
      this.emit(id);
    }
    this.commandMs = performance.now() - started;
    return true;
  }

  /**
   * Moves one sibling selection and publishes all snapshots before notifications.
   *
   * @param parent - Source parent; undefined denotes demo roots.
   * @param ids - Selected siblings in canonical order.
   * @param parents - Parent lookup captured before this command.
   * @param outdent - Whether to lift instead of nesting under the preceding sibling.
   * @param changed - Accumulates addressed sources notified after all writes.
   * @returns Ineligible first-root indentation and root outdent leave data unchanged.
   */
  private moveSiblingGroup(
    parent: string | undefined,
    ids: string[],
    parents: ReadonlyMap<string, string>,
    outdent: boolean,
    changed: Set<string>,
  ): void {
    const siblings = parent ? this.requiredNode(parent).childIds : this.blockIds;
    const first = siblings.indexOf(ids[0]!);
    if (outdent && !parent) {
      return;
    }
    const target = outdent ? parents.get(parent!) : siblings[first - 1];
    if (!outdent && !target) {
      return;
    }
    const destination = target ? this.requiredNode(target).childIds : this.blockIds;
    const insertion = outdent ? destination.indexOf(parent!) + 1 : destination.length;
    const selected = new Set(ids);
    this.replaceChildren(
      parent,
      siblings.filter((id) => !selected.has(id)),
      changed,
    );
    this.replaceChildren(
      target,
      [...destination.slice(0, insertion), ...ids, ...destination.slice(insertion)],
      changed,
    );
  }

  /**
   * Replaces a demo child list without exposing partially updated hierarchy to observers.
   *
   * @param parent - Parent identity, or undefined for the display roots.
   * @param childIds - Complete replacement sibling order.
   * @param changed - Sources to notify after the enclosing command completes.
   * @returns The host snapshot is replaced; notifications are deferred to the command.
   */
  private replaceChildren(
    parent: string | undefined,
    childIds: readonly string[],
    changed: Set<string>,
  ): void {
    if (parent) {
      this.nodes.set(parent, { ...this.requiredNode(parent), childIds });
      changed.add(parent);
    } else {
      this.blockIds = childIds;
      changed.add("block-ids");
    }
  }

  /**
   * Builds the parent index once per hierarchy replacement, without reading renderer state.
   *
   * @returns Cached actual parents; roots are absent from the map.
   */
  private getParentIds(): ReadonlyMap<string, string> {
    if (!this.parentIds) {
      const parents = new Map<string, string>();
      for (const node of this.nodes.values()) {
        for (const id of node.childIds) {
          parents.set(id, node.id);
        }
      }
      this.parentIds = parents;
    }
    return this.parentIds;
  }

  /**
   * Seeds real example hierarchy without adding placeholder content blocks.
   *
   * @param example - Host fixture selecting columns or wrapping tiles.
   * @param group - Zero-based fixture repetition used for stable unique IDs.
   * @returns The board ID to include in the display list.
   */
  private createBoard(example: "kanban" | "bento", group: number): string {
    const id = `board-${group + 1}`;
    const count = example === "kanban" ? 3 : 4;
    const childIds = Array.from({ length: count }, (_, index) => `${id}-item-${index + 1}`);
    this.nodes.set(id, {
      id,
      type: `demo-${example}`,
      text: example === "kanban" ? "Kanban" : "Bento",
      childIds,
    });
    for (const [index, childId] of childIds.entries()) {
      const nested = example === "kanban" ? 2 : Number(index < 2);
      const children = Array.from(
        { length: nested },
        (_, child) => `${childId}-child-${child + 1}`,
      );
      this.nodes.set(childId, {
        id: childId,
        type: example === "kanban" ? "demo-column" : "text",
        text: `Item ${index + 1}`,
        childIds: children,
        width: 280,
      });
      for (const nestedId of children) {
        this.nodes.set(nestedId, { id: nestedId, type: "text", text: "Nested text", childIds: [] });
      }
    }
    return id;
  }

  /**
   * Resolves an existing node within the example host's bounded fixture.
   *
   * @param id - Fixture node identity.
   * @returns Current immutable snapshot.
   * @throws If the identity is unknown.
   */
  private requiredNode(id: string): DemoNodeSnapshot {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Unknown demo node: ${id}`);
    }
    return node;
  }

  /**
   * Replaces one snapshot while preserving unrelated fields and child-array identity.
   *
   * @param id - Existing fixture identity.
   * @param patch - Own fields to replace; descendants are never copied.
   * @returns Addressed subscribers have run; duration includes synchronous notifications.
   * @throws If the identity is unknown or a subscriber fails.
   */
  private publish(id: string, patch: Partial<DemoNodeSnapshot>): void {
    const started = performance.now();
    const previous = this.requiredNode(id);
    const next = { ...previous, ...patch };
    this.nodes.set(id, next);
    if (next.childIds !== previous.childIds || next.collapsed !== previous.collapsed) {
      this.selectableIds = undefined;
      this.parentIds = undefined;
    }
    this.emit(id);
    this.commandMs = performance.now() - started;
  }

  /**
   * Adds one independently disposable callback to an addressed source.
   *
   * @param key - Node, selection or display-list source key.
   * @param listener - Callback invoked after this source changes.
   * @returns Idempotent disposer releasing the callback and empty source entry.
   */
  private subscribe(key: string, listener: () => void): () => void {
    const callback = () => {
      this.notifications += 1;
      listener();
    };
    return this.listeners.subscribe(key, callback);
  }

  /**
   * Notifies a captured list so disposal during delivery does not skip listeners.
   *
   * @param key - Addressed source whose snapshot has already changed.
   * @returns All captured callbacks have run; failures propagate to the caller.
   */
  private emit(key: string): void {
    this.listeners.emit(key);
  }
  /**
   * Stores host selection and notifies only changed membership booleans.
   *
   * @param snapshot - Directed coverage, or undefined to clear it.
   * @returns Snapshot is published before membership observers run.
   */
  private setSelection(snapshot: BlockSelectionSnapshot | undefined): void {
    const started = performance.now();
    const previous = this.selected;
    if (this.matchesSelection(snapshot)) {
      return;
    }
    this.selectionSnapshot = snapshot;
    this.selected = new Set(
      snapshot?.blocks
        .filter((block) => block.start === 0 && block.end === -1)
        .map((block) => block.id),
    );
    this.emit("selection-snapshot");
    for (const id of new Set([...previous, ...this.selected])) {
      if (previous.has(id) !== this.selected.has(id)) {
        this.emit(`selected:${id}`);
      }
    }
    this.selectionCommandMs = performance.now() - started;
  }

  /**
   * Flattens host hierarchy for selection or structural commands.
   *
   * @param includeCollapsed - True includes hidden descendants for model mutations.
   * @returns Cached selectable IDs, or an uncached complete order for structural commands.
   */
  private getOrderedBlockIds(includeCollapsed = false): readonly string[] {
    if (!includeCollapsed && this.selectableIds) {
      return this.selectableIds;
    }
    const result: string[] = [];
    const stack = [...this.blockIds].reverse();
    while (stack.length) {
      const id = stack.pop()!;
      const node = this.nodes.get(id);
      if (!node) {
        continue;
      }
      result.push(id);
      if (includeCollapsed || !node.collapsed) {
        stack.push(...[...node.childIds].reverse());
      }
    }
    if (!includeCollapsed) {
      this.selectableIds = result;
    }
    return result;
  }
  /**
   * Compares portable coverage without allocating serialized copies on pointer movement.
   *
   * @param next - Candidate coverage, or undefined to clear selection.
   * @returns Whether the current host snapshot already represents these directed ranges.
   */
  private matchesSelection(next: BlockSelectionSnapshot | undefined): boolean {
    const current = this.selectionSnapshot;
    if (current === next) {
      return true;
    }
    if (
      !current ||
      !next ||
      current.anchorBlockId !== next.anchorBlockId ||
      current.focusBlockId !== next.focusBlockId ||
      current.reversed !== next.reversed ||
      current.blocks.length !== next.blocks.length
    ) {
      return false;
    }
    return current.blocks.every((range, index) => {
      const other = next.blocks[index]!;
      return range.id === other.id && range.start === other.start && range.end === other.end;
    });
  }
}
