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
   * @param owner - Extension lifecycle owning registered contributions.
   */
  constructor(private readonly owner: RegistrationOwner) {}

  /** Monotonic entry-registry revision. */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Registers a entry owned by the React runtime and active extension.
   *
   * @param entry - Complete block context menu entry.
   * @returns Idempotent lifecycle-owned entry disposer.
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
   * Deletes a entry registered through this React manager.
   *
   * @param id - Stable block-context-menu identity.
   * @returns True when a React-owned entry existed and was disposed.
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

  /** Returns registered definitions in priority order with registration order breaking ties; availability is panel-specific. */
  getAll(): BlockContextMenuEntry[] {
    return [...this.entries.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** Returns the definition with this ID, or undefined when it is not registered. */
  get(id: string): BlockContextMenuEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * @param listener - Callback invoked when the registry revision changes.
   * @returns Subscription disposer.
   */
  subscribe(listener: BlockContextMenuRevisionListener): () => void {
    return this.store.subscribe(listener);
  }

  /** Releases registry listeners after extension-owned entries are disposed. */
  destroy(): void {
    this.entries.clear();
    this.registrations.clear();
    this.store.clear();
  }
}
