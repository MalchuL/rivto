import type {
  BlockEditorAdapter,
  BlockEditorNode,
  BlockEditorRegionSnapshot,
  BlockRenderer,
} from "../adapter/types";

/** Host-specific text data, deliberately outside the structural Page contract. */
interface TestBlockNode extends BlockEditorNode {
  /** Text read by the fixture renderer from its own host data. */
  readonly content: string;
}

/** In-memory addressed sources for autonomous rendering and notification-cost tests. */
export class TestBlockEditorAdapter implements BlockEditorAdapter {
  readonly nodes = new Map<string, TestBlockNode>();
  private snapshot: BlockEditorRegionSnapshot = { status: "available", blockIds: [] };
  private selected = new Set<string>();
  private readonly components = new Map<string, BlockRenderer>();
  private readonly listeners = new Map<string, Set<() => void>>();

  readonly region = {
    /**
     * Reads the cached fixture boundary without allocating another snapshot.
     *
     * @returns Current availability and root IDs.
     */
    getSnapshot: jest.fn(() => this.snapshot),
    /**
     * Observes fixture boundary changes independently of node changes.
     *
     * @param listener - Callback notified after the region snapshot changes.
     * @returns Disposer removing this subscription.
     */
    subscribe: jest.fn((listener: () => void) => this.subscribe("region", listener)),
  };

  readonly blocks = {
    /**
     * Reads one cached node without reading descendants or roots.
     *
     * @param id - Fixture node identity.
     * @returns Node or undefined when absent.
     */
    getBlockNode: jest.fn((id: string) => this.nodes.get(id)),
    /**
     * Observes only one node's direct fields.
     *
     * @param id - Fixture node identity.
     * @param listener - Callback notified after this node changes.
     * @returns Disposer removing this subscription.
     */
    subscribeBlockNode: jest.fn((id: string, listener: () => void) =>
      this.subscribe(`node:${id}`, listener),
    ),
  };

  readonly selection = {
    /**
     * Reads whole-block membership without allocating a selection object.
     *
     * @param id - Fixture block identity.
     * @returns Whether this block is selected.
     */
    isBlockSelected: jest.fn((id: string) => this.selected.has(id)),
    /**
     * Observes one block's membership independently of other selected IDs.
     *
     * @param id - Fixture block identity.
     * @param listener - Callback notified after membership changes.
     * @returns Disposer removing this subscription.
     */
    subscribeBlock: jest.fn((id: string, listener: () => void) =>
      this.subscribe(`selection:${id}`, listener),
    ),
  };

  readonly renderers = {
    /**
     * Reads the component identity retained for one type.
     *
     * @param type - Fixture block type.
     * @returns Its component or undefined when unregistered.
     */
    get: jest.fn((type: string) => this.components.get(type)),
    /**
     * Observes component installation and removal.
     *
     * @param listener - Callback that rereads renderer lookup results.
     * @returns Disposer removing this subscription.
     */
    subscribe: jest.fn((listener: () => void) => this.subscribe("renderers", listener)),
  };

  /**
   * Counts all currently retained subscriptions, including repeated source kinds.
   *
   * @returns Active listeners across region, nodes, selection, and renderer sources.
   */
  get subscriberCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }

  /**
   * Replaces the region boundary and synchronously notifies its consumers.
   *
   * @param blockIds - Ordered fixture roots.
   * @param status - Availability of their owning region; defaults to available.
   * @returns The new region snapshot has been published.
   */
  setRoots(blockIds: readonly string[], status: "available" | "missing" = "available"): void {
    this.snapshot = { status, blockIds };
    this.emit("region");
  }

  /**
   * Replaces a node while preserving child-list identity for content-only updates.
   *
   * @param id - Fixture node identity.
   * @param patch - Own fields to replace; omitted fields retain their existing values.
   * @returns The node is stored and its addressed listeners have been notified.
   */
  setNode(id: string, patch: Partial<TestBlockNode> = {}): void {
    this.nodes.set(id, {
      id,
      type: "text",
      content: id,
      childIds: [],
      ...this.nodes.get(id),
      ...patch,
    });
    this.emit(`node:${id}`);
  }

  /**
   * Deletes a node and notifies its consumers without changing the root source.
   *
   * @param id - Fixture node to remove.
   * @returns The missing snapshot has been published to this node's listeners.
   */
  deleteNode(id: string): void {
    this.nodes.delete(id);
    this.emit(`node:${id}`);
  }

  /**
   * Replaces whole-block selection and notifies only changed membership sources.
   *
   * @param ids - IDs selected after this update.
   * @returns Updated membership booleans have been published.
   */
  select(ids: readonly string[]): void {
    const previous = this.selected;
    this.selected = new Set(ids);
    for (const id of new Set([...previous, ...this.selected])) {
      if (previous.has(id) !== this.selected.has(id)) {
        this.emit(`selection:${id}`);
      }
    }
  }

  /**
   * Installs or removes a content component and publishes a registry change.
   *
   * @param type - Fixture block type to modify.
   * @param renderer - Component to install; undefined removes it.
   * @returns Renderer lookup consumers have been notified of the new state.
   */
  setRenderer(type: string, renderer: BlockRenderer | undefined): void {
    if (renderer) {
      this.components.set(type, renderer);
    } else {
      this.components.delete(type);
    }
    this.emit("renderers");
  }

  /**
   * Retains a callback in one addressed source.
   *
   * @param key - Source identity shared by reads and mutations.
   * @param listener - Callback to retain until disposed.
   * @returns Idempotent disposer removing the callback and any empty listener set.
   */
  private subscribe(key: string, listener: () => void): () => void {
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size && this.listeners.get(key) === listeners) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Notifies a detached listener list so unsubscription during delivery is safe.
   *
   * @param key - Addressed source changed by the fixture.
   * @returns Current listeners have run synchronously.
   */
  private emit(key: string): void {
    for (const listener of [...(this.listeners.get(key) ?? [])]) {
      listener();
    }
  }
}
