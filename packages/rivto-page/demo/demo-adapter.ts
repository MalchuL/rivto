import type {
  BlockEditorAdapter,
  BlockEditorNodePatch,
  BlockEditorNodeSnapshot,
  BlockEditorRegionSnapshot,
  BlockListType,
  BlockRenderer,
} from "../src";

/** List choices used by the demo host; not a second package registry. */
export const LIST_TYPES: readonly BlockListType[] = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
];

/** Original editor background tokens, implemented locally by the example host. */
export const BACKGROUND_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

/** Demo-owned content alongside the structural fields consumed by Page. */
interface DemoNodeSnapshot extends BlockEditorNodeSnapshot {
  readonly text: string;
}

/** On-demand counters; reading them does not notify the editor. */
export interface DemoMetrics {
  readonly nodeReads: number;
  readonly rootReads: number;
  readonly notifications: number;
  readonly subscriptions: number;
  readonly commandMs: number;
}

/** In-memory example host; its snapshots and registrations outlive editor remounts. */
export class DemoAdapter implements BlockEditorAdapter {
  private readonly nodes = new Map<string, DemoNodeSnapshot>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly renderersByType = new Map<string, BlockRenderer>();
  private roots: BlockEditorRegionSnapshot = { status: "available", blockIds: [] };
  private selected: string | undefined;
  private nodeReads = 0;
  private rootReads = 0;
  private notifications = 0;
  private commandMs = 0;

  readonly region = {
    /**
     * Reads root order without observing node edits.
     *
     * @returns Cached available-region snapshot.
     */
    getSnapshot: () => {
      this.rootReads += 1;
      return this.roots;
    },
    /**
     * Observes root-order changes.
     *
     * @param listener - Callback invoked after root replacement.
     * @returns Disposer releasing this observation.
     */
    subscribe: (listener: () => void) => this.subscribe("roots", listener),
  };

  readonly blocks = {
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
     * @throws If the node is unknown or the list mode/background token is unsupported.
     */
    updateBlockNode: (id: string, patch: BlockEditorNodePatch) => {
      if (patch.listType != null && !LIST_TYPES.includes(patch.listType)) {
        throw new Error("Unsupported list type");
      }
      if (patch.color && !BACKGROUND_COLORS.some((color) => color === patch.color)) {
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

  readonly renderers = {
    /**
     * Looks up a stable content component from the demo host.
     *
     * @param type - Content renderer type, independent of listType.
     * @returns Registered component, or undefined when disabled.
     */
    get: (type: string) => this.renderersByType.get(type),
    /**
     * Observes dynamic registrations.
     *
     * @param listener - Callback invoked after a renderer is replaced or removed.
     * @returns Disposer releasing this observation.
     */
    subscribe: (listener: () => void) => this.subscribe("renderers", listener),
  };

  /**
   * Creates five roots and one child per repeat without installing subscriptions.
   *
   * @param repeat - Fixture multiplier, clamped by the caller to 1–200.
   * @param renderer - Stable content renderer for ordinary demo blocks.
   */
  constructor(repeat: number, renderer: BlockRenderer) {
    const ids: string[] = [];
    this.renderersByType.set("text", renderer);
    for (let group = 0; group < repeat; group++) {
      for (let index = 0; index < 5; index++) {
        const id = `block-${group * 5 + index + 1}`;
        ids.push(id);
        this.nodes.set(id, {
          id,
          type: index === 4 ? "custom" : "text",
          text: `Текст ${id}`,
          childIds: index === 0 ? [`child-${group}`] : [],
          listType: LIST_TYPES[index],
          checked: false,
          collapsed: false,
        });
      }
      const id = `child-${group}`;
      this.nodes.set(id, { id, type: "text", text: "Вложенный блок", childIds: [] });
    }
    this.roots = { status: "available", blockIds: ids };
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
   * Reverses roots without replacing node snapshots.
   *
   * @returns Root subscribers observe the new order.
   */
  reverseRoots(): void {
    this.roots = { ...this.roots, blockIds: [...this.roots.blockIds].reverse() };
    this.emit("roots");
  }

  /**
   * Enables or disables the custom content renderer without replacing the adapter.
   *
   * @param renderer - Stable component, or undefined to remove its registration.
   * @returns Renderer lookup subscribers have been notified.
   */
  setCustomRenderer(renderer: BlockRenderer | undefined): void {
    if (renderer) {
      this.renderersByType.set("custom", renderer);
    } else {
      this.renderersByType.delete("custom");
    }
    this.emit("renderers");
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
      rootReads: this.rootReads,
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
    this.rootReads = 0;
    this.notifications = 0;
    this.commandMs = 0;
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
   * @param key - Node, selection, root, or renderer source key.
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
