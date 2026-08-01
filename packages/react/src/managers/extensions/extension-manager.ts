import type { ReactEditorImpl } from "../../react-editor";
import { RevisionStore } from "../../internal-store";
import type {
  ExtensionComponent,
  RegistrationDisposer,
  ReactEditorExtension,
} from "./types";

/**
 * Owns functional extension setup and every React manager registration lifecycle.
 *
 * Extension mounting is intentionally mode-free. Surface-specific behavior uses
 * event conditions, while surface renderers and wrappers belong exclusively to
 * SurfaceManager.
 */
export class ExtensionManager {
  private readonly store = new RevisionStore();
  private readonly extensionIds = new Set<string>();
  private readonly extensionDisposers: RegistrationDisposer[] = [];
  private readonly registrations = new Set<RegistrationDisposer>();
  private readonly components: Array<{ readonly component: ExtensionComponent }> = [];
  private activeExtensionRegistrations: RegistrationDisposer[] | null = null;
  private initialized = false;
  private destroyed = false;

  /**
   * Creates the mode-independent extension lifecycle owner.
   *
   * @param reactEditor - Complete owning runtime. Manager dependencies are
   * resolved from this owner when an operation runs.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Installs the creation-time extension list exactly once.
   *
   * This method exists for ReactEditor construction; dynamic extension installation
   * is deliberately deferred even though manager registrations remain dynamic.
   *
   * @param extensions - Ordered functional extensions with unique stable IDs.
   */
  initialize(extensions: readonly ReactEditorExtension[]): void {
    this.assertActive();
    if (this.initialized) throw new Error("React extensions are already initialized");
    this.initialized = true;
    for (const extension of extensions) this.install(extension);
  }

  /**
   * Mounts extension UI globally beside the active surface.
   *
   * @param component - Headless behavior or visual overlay component.
   * @returns Idempotent disposer for this exact mount, even when the same
   * component is mounted multiple times.
   */
  mount(component: ExtensionComponent): () => void {
    this.assertActive();
    const registration = { component };
    this.components.push(registration);
    this.store.changed();
    return this.own(() => {
      const index = this.components.indexOf(registration);
      if (index < 0) return;
      this.components.splice(index, 1);
      this.store.changed();
    });
  }

  /** @returns Defensive mounted-component list in declaration order. */
  getComponents(): readonly ExtensionComponent[] {
    return this.components.map(({ component }) => component);
  }

  get revision(): number {
    return this.store.revision;
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Gives a manager registration runtime and active-extension ownership.
   *
   * @param release - Exact underlying resource cleanup.
   * @returns Idempotent disposer safe for callers and repeated teardown.
   */
  own(release: RegistrationDisposer): RegistrationDisposer {
    this.assertActive();
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      release();
      this.registrations.delete(dispose);
    };
    this.registrations.add(dispose);
    this.activeExtensionRegistrations?.push(dispose);
    return dispose;
  }

  /** Throws when a manager mutation is attempted after runtime destruction. */
  assertActive(): void {
    if (this.destroyed) throw new Error("React editor is destroyed");
  }

  /**
   * Runs extension cleanup and all remaining registrations in reverse order.
   *
   * Extension custom cleanup runs before its manager-owned registrations, matching
   * the setup ownership contract. Dynamic registrations are released afterward.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.extensionDisposers.reverse().forEach((dispose) => dispose());
    [...this.registrations].reverse().forEach((dispose) => dispose());
    this.components.length = 0;
    this.store.clear();
  }

  /** Installs one extension with duplicate validation and partial rollback. */
  private install(extension: ReactEditorExtension): void {
    if (!extension.id.trim()) throw new Error("React extension ID is required");
    if (this.extensionIds.has(extension.id)) {
      throw new Error(`React extension ${extension.id} is already registered`);
    }
    const owned: RegistrationDisposer[] = [];
    this.extensionIds.add(extension.id);
    this.activeExtensionRegistrations = owned;
    try {
      const cleanup = extension.setup(this.reactEditor);
      this.extensionDisposers.push(() => {
        cleanup?.();
        owned.reverse().forEach((dispose) => dispose());
        this.extensionIds.delete(extension.id);
      });
    } catch (error) {
      owned.reverse().forEach((dispose) => dispose());
      this.extensionIds.delete(extension.id);
      throw error;
    } finally {
      this.activeExtensionRegistrations = null;
    }
  }
}
