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
}

/** In-memory example host; its snapshots outlive view remounts. */
export class DemoAdapter implements BlockEditorAdapter {
  private readonly nodes = new Map<string, DemoNodeSnapshot>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private blockIds: readonly string[] = [];
  private selected: string | undefined;
  private nodeReads = 0;
  private blockIdsReads = 0;
  private notifications = 0;
  private commandMs = 0;

  readonly blocks = {
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
     * Reads whole-block selection from the example host.
     *
     * @param id - Demo node identity.
     * @returns Whether this ID is selected.
     */
    isBlockSelected: (id: string) => this.selected === id,
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
   * @param text - Current textarea value, stored without rich-text conversion.
   * @returns The node's addressed subscribers have been notified.
   * @throws If the ID is unknown.
   */
  setText(id: string, text: string): void {
    this.publish(id, { text });
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
    const previous = this.selected;
    this.selected = id;
    for (const changed of new Set([previous, id])) {
      if (changed) {
        this.emit(`selected:${changed}`);
      }
    }
  }

  /**
   * Reverses the displayed block order without replacing node snapshots.
   *
   * @returns Display-list subscribers observe the new order.
   */
  reverseBlockIds(): void {
    this.blockIds = [...this.blockIds].reverse();
    this.emit("block-ids");
  }

  /**
   * Captures counters without subscribing toolbar chrome to each editor read.
   *
   * @returns Current read/notification counts, active subscriptions, and last synchronous command ms.
   */
  getMetrics(): DemoMetrics {
    let subscriptions = 0;
    for (const listeners of this.listeners.values()) {
      subscriptions += listeners.size;
    }
    return {
      nodeReads: this.nodeReads,
      blockIdsReads: this.blockIdsReads,
      notifications: this.notifications,
      subscriptions,
      commandMs: this.commandMs,
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
    this.nodes.set(id, { ...this.requiredNode(id), ...patch });
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
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    const callback = () => listener();
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (!listeners.size) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Notifies a captured list so disposal during delivery does not skip listeners.
   *
   * @param key - Addressed source whose snapshot has already changed.
   * @returns All captured callbacks have run; failures propagate to the caller.
   */
  private emit(key: string): void {
    for (const listener of [...(this.listeners.get(key) ?? [])]) {
      this.notifications += 1;
      listener();
    }
  }
}
