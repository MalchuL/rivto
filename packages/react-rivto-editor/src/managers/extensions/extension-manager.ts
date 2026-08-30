import type { ReactEditorImpl } from "../../react-editor";
import type { ExtensionsCapability } from "../../capabilities";
import { RevisionStore } from "../../internal-store";
import type {
  ExtensionComponent,
  ExtensionMountPosition,
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
export class ExtensionManager implements ExtensionsCapability {
  private readonly store = new RevisionStore();
  private readonly extensionIds = new Set<string>();
  private readonly extensionDisposers: RegistrationDisposer[] = [];
  private readonly registrations = new Set<RegistrationDisposer>();
  private readonly components: Array<{
    readonly component: ExtensionComponent;
    readonly position: ExtensionMountPosition;
  }> = [];
  private activeExtensionRegistrations: RegistrationDisposer[] | null = null;
  private destroyed = false;

  /**
   * Creates the mode-independent extension lifecycle owner.
   *
   * @param reactEditor - Complete owning runtime. Manager dependencies are
   * resolved from this owner when an operation runs.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Installs the creation-time extension list.
   *
   * Subsequent calls install additional unique extensions. Dynamic hosts should
   * prefer {@link install} so they receive a disposer.
   *
   * @param extensions - Ordered functional extensions with unique stable IDs.
   */
  initialize(extensions: readonly ReactEditorExtension[]): void {
    this.assertActive();
    for (const extension of extensions) this.install(extension);
  }

  /**
   * Mounts extension UI beside the active surface.
   *
   * @param component - Headless behavior or visual overlay component.
   * @param position - Placement relative to the surface; defaults to before it.
   * @returns Idempotent disposer for this exact mount, even when the same
   * component is mounted multiple times.
   */
  mount(
    component: ExtensionComponent,
    position: ExtensionMountPosition = "beforeSurface",
  ): () => void {
    this.assertActive();
    const registration = { component, position };
    this.components.push(registration);
    this.store.changed();
    return this.own(() => {
      const index = this.components.indexOf(registration);
      if (index < 0) return;
      this.components.splice(index, 1);
      this.store.changed();
    });
  }

  /**
   * Returns mounted components, optionally filtered by surface placement.
   *
   * @param position - When omitted, every mount is returned in declaration order.
   * @returns Defensive component list.
   */
  getComponents(position?: ExtensionMountPosition): readonly ExtensionComponent[] {
    return this.components
      .filter((item) => position === undefined || item.position === position)
      .map(({ component }) => component);
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
   * Each disposer runs independently. Failures are collected and rethrown after
   * every owned resource has been released.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    const run = (dispose: () => void): void => {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    };
    [...this.extensionDisposers].reverse().forEach(run);
    [...this.registrations].reverse().forEach(run);
    this.components.length = 0;
    this.store.clear();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Extension teardown failed");
  }

  /**
   * Installs one extension with duplicate validation and partial rollback.
   *
   * @param extension - Functional extension with a unique stable ID.
   * @returns Disposer that runs custom cleanup, then owned registrations.
   */
  install(extension: ReactEditorExtension): () => void {
    this.assertActive();
    if (!extension.id.trim()) throw new Error("React extension ID is required");
    if (this.extensionIds.has(extension.id)) {
      throw new Error(`React extension ${extension.id} is already registered`);
    }
    const owned: RegistrationDisposer[] = [];
    this.extensionIds.add(extension.id);
    this.activeExtensionRegistrations = owned;
    let dispose: RegistrationDisposer = () => undefined;
    try {
      const cleanup = extension.setup(this.reactEditor);
      dispose = () => {
        let cleanupError: unknown;
        try {
          cleanup?.();
        } catch (error) {
          cleanupError = error;
        }
        owned.slice().reverse().forEach((release) => {
          try {
            release();
          } catch {
            // Owned registrations must still release after a throwing cleanup.
          }
        });
        this.extensionIds.delete(extension.id);
        const index = this.extensionDisposers.indexOf(dispose);
        if (index >= 0) this.extensionDisposers.splice(index, 1);
        if (cleanupError) throw cleanupError;
      };
      this.extensionDisposers.push(dispose);
      return dispose;
    } catch (error) {
      owned.slice().reverse().forEach((release) => {
        try {
          release();
        } catch {
          // Rollback is best-effort so the original setup error is preserved.
        }
      });
      this.extensionIds.delete(extension.id);
      throw error;
    } finally {
      this.activeExtensionRegistrations = null;
    }
  }
}
