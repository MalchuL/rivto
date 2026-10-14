import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type { BlockContextMenuEntry } from "./types";
type BlockContextMenuRevisionListener = () => void;

/** Owns ordered block context menu entries for the React runtime. */
export class BlockContextMenuRegistry {
  private readonly entries = new Map<string, BlockContextMenuEntry>();
  private readonly registrations = new Map<string, () => void>();
  private readonly store = new RevisionStore();

  /**
   * Creates an empty registry bound to the supplied extension lifecycle.
   *
   * @param owner - Lifecycle used to reject inactive registrations and own their cleanup.
   */
  constructor(private readonly owner: RegistrationOwner) {}

  /**
   * Reads the revision used to subscribe menu renderers to registration changes.
   *
   * @returns The current monotonically increasing registry revision. Document
   * edits and availability changes do not themselves increment this value.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Registers one menu definition and publishes a registry revision.
   *
   * The definition is retained by reference. Availability is evaluated later by
   * the panel, not during registration. Cleanup removes this exact registration
   * and publishes another revision; calling its disposer again is harmless.
   * Parent existence and submenu cycles beyond direct self-parenting are not
   * validated here.
   *
   * @param entry - Definition with a nonempty ID and title, plus the executor or
   * renderer required by its kind. An omitted kind denotes an action.
   * @returns An idempotent disposer also owned by the active extension lifecycle.
   * @throws If the owner is inactive, ID or title is blank, the required executor
   * or renderer is missing, the entry parents itself, or its ID is already registered.
   */
  register(entry: BlockContextMenuEntry): () => void {
    const extensions = this.owner;
    extensions.assertActive();
    if (!entry.id.trim()) {
      throw new Error("Block context menu entry ID is required");
    }
    if (!entry.title.trim()) {
      throw new Error("Block context menu entry title is required");
    }
    if ((!entry.kind || entry.kind === "action") && !entry.execute) {
      throw new Error("Block context menu actions require an executor");
    }
    if (entry.kind === "custom" && !entry.render) {
      throw new Error("Custom block context menu entries require a renderer");
    }
    if (entry.parentId === entry.id) {
      throw new Error("A block context menu entry cannot contain itself");
    }
    if (this.entries.has(entry.id)) {
      throw new Error(`Block context menu entry ${entry.id} is already registered`);
    }
    this.entries.set(entry.id, entry);
    this.store.changed();
    /**
     * Holds the cleanup identity captured by the registration callback.
     *
     * @returns Initially does nothing; replaced below by the lifecycle-owned disposer
     * that removes this entry and publishes the registry change.
     */
    let dispose: () => void = () => undefined;
    dispose = extensions.registerCleanup(() => {
      if (this.registrations.get(entry.id) === dispose) {
        this.registrations.delete(entry.id);
      }
      if (this.entries.get(entry.id) !== entry) {
        return;
      }
      this.entries.delete(entry.id);
      this.store.changed();
    });
    this.registrations.set(entry.id, dispose);
    return dispose;
  }

  /**
   * Disposes the registration with the supplied ID and publishes its removal.
   *
   * @param id - Stable block-context-menu identity.
   * @returns True when a React-owned entry existed and was disposed; false when
   * no disposer is registered for that ID.
   * @throws If the owning lifecycle is inactive.
   */
  delete(id: string): boolean {
    this.owner.assertActive();
    const dispose = this.registrations.get(id);
    if (!dispose) {
      return false;
    }
    dispose();
    return true;
  }

  /**
   * Reads definitions in ascending order, preserving registration order for ties.
   *
   * @returns A new array containing the registered definition references. Missing
   * order values count as zero. Entries are not filtered for panel availability.
   */
  getAll(): BlockContextMenuEntry[] {
    return [...this.entries.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /**
   * Looks up a definition without evaluating its availability.
   *
   * @param id - Exact registration ID to resolve.
   * @returns The retained definition reference, or undefined if unregistered.
   */
  get(id: string): BlockContextMenuEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Subscribes to registration additions and removals.
   *
   * @param listener - Callback invoked when the registry revision changes.
   * @returns Subscription disposer.
   */
  subscribe(listener: BlockContextMenuRevisionListener): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Clears definitions, disposer references, and registry listeners.
   *
   * The editor lifecycle must dispose extension-owned registrations first; this
   * method does not invoke the retained disposers itself.
   *
   * @returns No value after the registry and its subscriptions have been cleared.
   */
  destroy(): void {
    this.entries.clear();
    this.registrations.clear();
    this.store.clear();
  }
}
