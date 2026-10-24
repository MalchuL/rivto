import { RevisionStore } from "../../utils/revision-store";
import type {
  CanvasRegistrationOwner,
  CanvasToolEntry,
  CanvasToolGroupEntry,
  CanvasToolRegistration,
} from "../../types/tool-registry";

/** Visible top-level entry; grouped tools are resolved through their group. */
export type CanvasToolbarEntry<Tool, Group> =
  | { readonly kind: "tool"; readonly registration: Tool }
  | { readonly kind: "group"; readonly registration: Group };

/** Extension-owned groups and tools; registering presentation never changes document content. */
export class CanvasToolRegistry<
  Tool extends CanvasToolEntry = CanvasToolRegistration,
  Group extends CanvasToolGroupEntry = CanvasToolGroupEntry,
> {
  private readonly groups = new Map<string, Group>();
  private readonly tools = new Map<string, Tool>();
  private readonly positions = new WeakMap<object, number>();
  private sequence = 0;
  private readonly store = new RevisionStore();
  private disposed = false;

  /**
   * Creates an empty registry without instantiating tools or changing application content.
   *
   * @param owner - Optional application lifecycle; omitted registries own their disposers.
   * Host teardown disposes the registry after its owned registrations are released.
   */
  constructor(private readonly owner?: CanvasRegistrationOwner) {
    owner?.registerCleanup(() => this.dispose());
  }

  /**
   * Installs a shared group and synchronously notifies registry observers.
   * Removing it hides its member tools until a group with the same ID is installed again.
   *
   * @param group - Unique group definition.
   * @returns Idempotent extension-owned removal.
   * @throws For duplicate IDs or an inactive owner.
   */
  registerGroup(group: Group): () => void {
    return this.register(this.groups, group);
  }
  /**
   * Installs a tool factory while preserving one configured fallback interaction.
   *
   * @param tool - Shared registration; its factory creates surface-local instances.
   * @returns Idempotent owner-bound removal without deleting document content.
   * @throws For an existing default, duplicate ID or inactive registration owner.
   */
  registerTool(tool: Tool): () => void {
    if (tool.default && this.getTools().some((entry) => entry.default)) {
      throw new Error("A default canvas tool is already registered");
    }
    return this.register(this.tools, tool);
  }
  /**
   * Looks up a shared group definition without copying it.
   *
   * @param id - Group ID.
   * @returns Installed group, or undefined.
   */
  getGroup(id: string): Group | undefined {
    return this.groups.get(id);
  }
  /**
   * Looks up a shared tool definition without copying it.
   *
   * @param id - Tool ID.
   * @returns Installed tool, or undefined.
   */
  getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }
  /**
   * Lists all groups, including those without members.
   *
   * @returns Detached array of shared group definitions ordered by order and registration.
   */
  getGroups(): readonly Group[] {
    return [...this.groups.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  /**
   * Lists all tools, including members of groups that have not been installed.
   *
   * @returns Detached array of shared tool definitions ordered by order and registration, including deferred tools.
   */
  getTools(): readonly Tool[] {
    return [...this.tools.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  /**
   * Builds the visible top-level toolbar entries; unresolved group members are omitted.
   *
   * @returns Top-level groups and standalone tools ordered together by order, then registration; empty groups are omitted.
   */
  getEntries(): readonly CanvasToolbarEntry<Tool, Group>[] {
    const tools = this.getTools();
    const entries: CanvasToolbarEntry<Tool, Group>[] = [
      ...this.getGroups()
        .filter((group) => tools.some((tool) => tool.group === group.id))
        .map((registration) => ({ kind: "group" as const, registration })),
      ...tools
        .filter((tool) => !tool.group)
        .map((registration) => ({ kind: "tool" as const, registration })),
    ];
    return entries.sort(
      (a, b) =>
        (a.registration.order ?? 0) - (b.registration.order ?? 0) ||
        this.positions.get(a.registration)! - this.positions.get(b.registration)!,
    );
  }
  /**
   * Observes synchronous registry changes; subscribing does not emit an initial notification.
   *
   * @param listener - Called synchronously after registration changes, without an initial call.
   * @returns Unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
  /**
   * Reads the stable registry revision used by external-store subscribers.
   *
   * @returns The same token until registrations change.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Releases all registrations and observers owned by this registry.
   *
   * @returns Mounted sessions are notified before subscribers are cleared, including when notification throws.
   * @throws Propagates subscriber failures after clearing registrations and observers.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.groups.clear();
    this.tools.clear();
    try {
      this.store.changed();
    } finally {
      this.store.clear();
    }
  }

  /**
   * Registers a toolbar entry with stable insertion order and notifies subscribers.
   *
   * @param entries - Registry for toolbar tools or toolbar groups.
   * @param entry - Toolbar entry with its stable registration ID.
   * @returns Owned cleanup that removes the entry and publishes the change.
   * @throws If ownership is inactive or the entry ID is already registered.
   */
  private register<T extends { readonly id: string }>(
    entries: Map<string, T>,
    entry: T,
  ): () => void {
    this.owner?.assertActive();
    if (this.disposed) {
      throw new Error("Canvas tool registry is disposed");
    }
    if (entries.has(entry.id)) {
      throw new Error(`Canvas toolbar registration ${entry.id} already exists`);
    }
    this.positions.set(entry, this.sequence++);
    entries.set(entry.id, entry);
    this.store.changed();
    /**
     * Removes this registration only while the original entry still owns its identity.
     *
     * @returns Subscribers are notified only when this entry was still registered.
     */
    const release = () => {
      if (entries.get(entry.id) === entry) {
        entries.delete(entry.id);
        this.store.changed();
      }
    };
    return this.owner ? this.owner.registerCleanup(release) : release;
  }
}
