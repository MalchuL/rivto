import type { BlockSelectionSnapshot } from "../editor/selection/types";
import type {
  BlockEditorAdapter,
  BlockEditorNodePatch,
  BlockEditorNodeSnapshot,
} from "../adapter/types";

/** Host-specific text data, deliberately outside the structural Page contract. */
interface TestBlockNode extends BlockEditorNodeSnapshot {
  /** Text read by the fixture renderer from its own host data. */
  readonly content: string;
}

/** In-memory addressed sources for autonomous rendering and notification-cost tests. */
export class TestBlockEditorAdapter implements BlockEditorAdapter {
  readonly nodes = new Map<string, TestBlockNode>();
  private blockIds: readonly string[] = [];
  private selectionSnapshot: BlockSelectionSnapshot | undefined;
  private selectableIds: readonly string[] | undefined;
  private selected = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();

  rootIds: readonly string[] | undefined;

  readonly blocks = {
    /**
     * Reads explicitly supplied canonical roots independently of fixture display IDs.
     *
     * @returns Root destination IDs, or undefined when not exposed by the fixture.
     */
    getRootIds: jest.fn(() => this.rootIds),
    /**
     * Resolves fixture hierarchy without consulting mounted DOM.
     *
     * @param id - Fixture identity to locate.
     * @returns Parent ID, or undefined for a root or missing node.
     */
    getParentId: (id: string) =>
      [...this.nodes.values()].find((node) => node.childIds.includes(id))?.id,
    /**
     * Reads the cached fixture boundary without allocating another snapshot.
     *
     * @returns Current host-selected display IDs.
     */
    getBlockIds: jest.fn(() => this.blockIds),
    /**
     * Observes fixture boundary changes independently of node changes.
     *
     * @param listener - Callback notified after the display list changes.
     * @returns Disposer removing this subscription.
     */
    subscribeBlockIds: jest.fn((listener: () => void) => this.subscribe("block-ids", listener)),
    /**
     * Reads one cached node without reading descendants or the display list.
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
    /**
     * Applies limited presentation fields to the fixture host's current snapshot.
     *
     * @param id - Existing fixture identity.
     * @param patch - New values; omitted fields retain their current values.
     * @returns A replacement snapshot has been published to addressed consumers.
     * @throws If the node has disappeared before the write.
     */
    updateBlockNode: jest.fn((id: string, patch: BlockEditorNodePatch) => {
      const node = this.nodes.get(id);
      if (!node) {
        throw new Error(`Block ${id} is unavailable`);
      }
      this.setNode(id, {
        listType: patch.listType === null ? undefined : (patch.listType ?? node.listType),
        checked: patch.checked ?? node.checked,
        collapsed: patch.collapsed ?? node.collapsed,
        color: patch.color === null ? undefined : (patch.color ?? node.color),
      });
    }),
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
    getSelectableBlockIds: () => this.getSelectableIds(),
    /**
     * Reads the host text's UTF-16 length without a node conversion.
     *
     * @param id - Fixture identity.
     * @returns Text length, or undefined for a missing node.
     */
    getTextLength: (id: string) => this.nodes.get(id)?.content.length,

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

  /**
   * Counts all currently retained subscriptions, including repeated source kinds.
   *
   * @returns Active listeners across display-list, nodes, and selection sources.
   */
  get subscriberCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }

  /**
   * Replaces the displayed block list and synchronously notifies its consumers.
   *
   * @param blockIds - Ordered fixture display IDs.
   * @returns The new display list has been published.
   */
  setBlockIds(blockIds: readonly string[]): void {
    this.blockIds = blockIds;
    this.selectableIds = undefined;
    this.emit("block-ids");
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
    this.selectableIds = undefined;
    this.emit(`node:${id}`);
  }

  /**
   * Deletes a node and notifies its consumers without changing the display list.
   *
   * @param id - Fixture node to remove.
   * @returns The missing snapshot has been published to this node's listeners.
   */
  deleteNode(id: string): void {
    this.nodes.delete(id);
    this.selectableIds = undefined;
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
        this.selectableIds = undefined;
        this.emit(`selection:${id}`);
      }
    }
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
  /**
   * Stores host selection and notifies only changed membership booleans.
   *
   * @param snapshot - Directed coverage, or undefined to clear it.
   * @returns Snapshot is published before membership observers run.
   */
  private setSelection(snapshot: BlockSelectionSnapshot | undefined): void {
    const previous = this.selected;
    this.selectionSnapshot = snapshot;
    this.selected = new Set(
      snapshot?.blocks
        .filter((block) => block.start === 0 && block.end === -1)
        .map((block) => block.id),
    );
    for (const id of new Set([...previous, ...this.selected])) {
      if (previous.has(id) !== this.selected.has(id)) {
        this.emit(`selection:${id}`);
      }
    }
  }

  /**
   * Flattens visible host hierarchy once per invalidation.
   *
   * @returns Cached depth-first IDs, excluding descendants of collapsed blocks.
   */
  private getSelectableIds(): readonly string[] {
    if (this.selectableIds) {
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
      if (!node.collapsed) {
        stack.push(...[...node.childIds].reverse());
      }
    }
    this.selectableIds = result;
    return result;
  }
}
