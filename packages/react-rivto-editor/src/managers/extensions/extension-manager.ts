import type { ReactEditorApi } from "../../editor/types";
import { RevisionStore } from "../../internal-store";
import type { ExtensionsApi } from "./api";
import type {
  ExtensionComponent,
  ExtensionMountPosition,
  ReactEditorExtension,
  RegistrationDisposer,
} from "./types";

/**
 * Owns functional extension setup and every React manager registration lifecycle.
 *
 * Extension mounting is intentionally mode-free. Surface-specific behavior uses
 * event conditions, while surface renderers and wrappers belong exclusively to
 * SurfaceManager.
 */
export class ExtensionManager implements ExtensionsApi {
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
   * @param reactEditor - Owning React runtime supplied during extension setup.
   */
  constructor(private readonly reactEditor: ReactEditorApi) {}

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
    for (const extension of extensions) {
      this.install(extension);
    }
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
    return this.registerCleanup(() => {
      const index = this.components.indexOf(registration);
      if (index < 0) {
        return;
      }
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

  /**
   * Reads the extension runtime's observable revision.
   *
   * @returns Current revision number.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes extension component registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Gives a manager registration runtime and active-extension ownership.
   *
   * @param release - Exact underlying resource cleanup.
   * @returns Idempotent disposer safe for callers and repeated teardown.
   */
  registerCleanup(release: RegistrationDisposer): RegistrationDisposer {
    this.assertActive();
    let active = true;
    const dispose = () => {
      if (!active) {
        return;
      }
      active = false;
      this.registrations.delete(dispose);
      release();
    };
    this.registrations.add(dispose);
    this.activeExtensionRegistrations?.push(dispose);
    return dispose;
  }

  /** Throws when a manager mutation is attempted after runtime destruction. */
  assertActive(): void {
    if (this.destroyed) {
      throw new Error("React editor is destroyed");
    }
  }

  /**
   * Runs extension cleanup and all remaining registrations in reverse order.
   *
   * Each disposer runs independently. Failures are collected and rethrown after
   * every owned resource has been released.
   *
   * @returns Extension and registration cleanup has been attempted; repeated calls do nothing.
   * @throws The single cleanup failure, or AggregateError containing multiple failures.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    try {
      this.releaseAll([...this.registrations, ...this.extensionDisposers]);
    } finally {
      this.components.length = 0;
      this.store.clear();
    }
  }

  /**
   * Installs one extension with duplicate validation and partial rollback.
   *
   * Nested setup restores the parent's capture scope, and child installations
   * belong to their parent. Failed setup rolls back captured resources and frees
   * the ID for reuse, retaining the original error alongside rollback failures.
   *
   * @param extension - Functional extension with a unique stable ID and synchronous setup.
   * @returns Idempotent disposer that runs custom cleanup, then owned registrations.
   * @throws If inactive, the ID is empty/duplicate, setup fails or returns invalid cleanup,
   * or rollback fails. Multiple failures are reported together.
   */
  install(extension: ReactEditorExtension): () => void {
    this.assertActive();
    if (!extension.id.trim()) {
      throw new Error("React extension ID is required");
    }
    if (this.extensionIds.has(extension.id)) {
      throw new Error(`React extension ${extension.id} is already registered`);
    }
    const owned: RegistrationDisposer[] = [];
    const parent = this.activeExtensionRegistrations;
    this.extensionIds.add(extension.id);
    this.activeExtensionRegistrations = owned;
    let cleanup: void | RegistrationDisposer;
    try {
      cleanup = extension.setup(this.reactEditor);
      if (cleanup !== undefined && typeof cleanup !== "function") {
        throw new TypeError("React extension setup must return synchronous cleanup or undefined");
      }
    } catch (error) {
      this.extensionIds.delete(extension.id);
      // Rollback attempts every resource and retains both setup and release failures.
      this.releaseAll(owned, [error]);
      throw error;
    } finally {
      this.activeExtensionRegistrations = parent;
    }
    const dispose = this.createExtensionDisposer(extension.id, cleanup, owned);
    this.extensionDisposers.push(dispose);
    parent?.push(dispose);
    return dispose;
  }

  /**
   * Creates once-only removal for an installed extension and its captured resources.
   *
   * Identity is released before invoking user cleanup, so reentrant removal and
   * later ID reuse cannot remove another installation. Custom cleanup runs first;
   * owned registrations must still release after a throwing cleanup.
   *
   * @param id - Installation identity reserved by the completed setup.
   * @param cleanup - Optional synchronous cleanup returned by setup.
   * @param owned - Resources and nested installations captured during that setup.
   * @returns Idempotent disposer that attempts all releases in reverse acquisition order.
   * @throws The single cleanup failure, or AggregateError containing all failures.
   */
  private createExtensionDisposer(
    id: string,
    cleanup: void | RegistrationDisposer,
    owned: readonly RegistrationDisposer[],
  ): RegistrationDisposer {
    let active = true;
    const dispose = () => {
      if (!active) {
        return;
      }
      active = false;
      this.extensionIds.delete(id);
      const index = this.extensionDisposers.indexOf(dispose);
      if (index >= 0) {
        this.extensionDisposers.splice(index, 1);
      }
      const releases = [...owned];
      if (cleanup) {
        releases.push(cleanup);
      }
      this.releaseAll(releases);
    };
    return dispose;
  }

  /**
   * Attempts every captured cleanup in reverse order and retains all failures.
   *
   * A snapshot permits callbacks to remove other registrations during teardown.
   * A single failure keeps its original identity; multiple failures are aggregated.
   *
   * @param releases - Resources ordered by acquisition, including nested installations.
   * @param errors - Earlier failures to preserve, such as the original setup error.
   * @returns Every cleanup was attempted without failure.
   * @throws The single failure, or AggregateError after all cleanup attempts.
   */
  private releaseAll(releases: readonly RegistrationDisposer[], errors: unknown[] = []): void {
    for (const release of [...releases].reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Extension cleanup failed");
    }
  }
}
