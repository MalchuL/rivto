import type { ReactEditor } from "../../../react-editor";
import type {
  PluginComponent,
  RegistrationDisposer,
  ReactEditorPlugin,
} from "./types";

/**
 * Owns functional plugin setup and every React manager registration lifecycle.
 *
 * Plugin mounting is intentionally mode-free. Surface-specific behavior uses
 * event conditions, while surface renderers and wrappers belong exclusively to
 * SurfaceManager.
 */
export class PluginManager {
  private readonly pluginIds = new Set<string>();
  private readonly pluginDisposers: RegistrationDisposer[] = [];
  private readonly registrations = new Set<RegistrationDisposer>();
  private readonly components: Array<{ readonly component: PluginComponent }> = [];
  private activePluginRegistrations: RegistrationDisposer[] | null = null;
  private initialized = false;
  private destroyed = false;

  /**
   * Creates the mode-independent plugin lifecycle owner.
   *
   * @param reactEditor - Complete owning runtime. Manager dependencies are
   * resolved from this owner when an operation runs.
   */
  constructor(private readonly reactEditor: ReactEditor) {}

  /**
   * Installs the creation-time plugin list exactly once.
   *
   * This method exists for ReactEditor construction; dynamic plugin installation
   * is deliberately deferred even though manager registrations remain dynamic.
   *
   * @param plugins - Ordered functional extensions with unique stable IDs.
   */
  initialize(plugins: readonly ReactEditorPlugin[]): void {
    this.assertActive();
    if (this.initialized) throw new Error("React plugins are already initialized");
    this.initialized = true;
    for (const plugin of plugins) this.install(plugin);
  }

  /**
   * Mounts plugin UI globally beside the active surface.
   *
   * @param component - Headless behavior or visual overlay component.
   * @returns Idempotent disposer for this exact mount, even when the same
   * component is mounted multiple times.
   */
  mount(component: PluginComponent): () => void {
    this.assertActive();
    const registration = { component };
    this.components.push(registration);
    this.reactEditor.invalidate();
    return this.own(() => {
      const index = this.components.indexOf(registration);
      if (index < 0) return;
      this.components.splice(index, 1);
      this.reactEditor.invalidate();
    });
  }

  /** @returns Defensive mounted-component list in declaration order. */
  getComponents(): readonly PluginComponent[] {
    return this.components.map(({ component }) => component);
  }

  /**
   * Gives a manager registration runtime and active-plugin ownership.
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
    this.activePluginRegistrations?.push(dispose);
    return dispose;
  }

  /** Throws when a manager mutation is attempted after runtime destruction. */
  assertActive(): void {
    if (this.destroyed) throw new Error("React editor is destroyed");
  }

  /**
   * Runs plugin cleanup and all remaining registrations in reverse order.
   *
   * Plugin custom cleanup runs before its manager-owned registrations, matching
   * the setup ownership contract. Dynamic registrations are released afterward.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pluginDisposers.reverse().forEach((dispose) => dispose());
    [...this.registrations].reverse().forEach((dispose) => dispose());
    this.components.length = 0;
  }

  /** Installs one plugin with duplicate validation and partial rollback. */
  private install(plugin: ReactEditorPlugin): void {
    if (!plugin.id.trim()) throw new Error("React plugin ID is required");
    if (this.pluginIds.has(plugin.id)) {
      throw new Error(`React plugin ${plugin.id} is already registered`);
    }
    const owned: RegistrationDisposer[] = [];
    this.pluginIds.add(plugin.id);
    this.activePluginRegistrations = owned;
    try {
      const cleanup = plugin.setup(this.reactEditor);
      this.pluginDisposers.push(() => {
        cleanup?.();
        owned.reverse().forEach((dispose) => dispose());
        this.pluginIds.delete(plugin.id);
      });
    } catch (error) {
      owned.reverse().forEach((dispose) => dispose());
      this.pluginIds.delete(plugin.id);
      throw error;
    } finally {
      this.activePluginRegistrations = null;
    }
  }
}
