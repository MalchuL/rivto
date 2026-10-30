import type { BlockLayout } from "@chulane/rivto-page";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type { BlockRenderer, BlockRendererRegistration } from "./renderer-types";
import type { RenderersApi } from "./renderers-api";

/**
 * Owns React content renderers indexed by persisted block type.
 *
 * Renderer storage is independent from core block definitions so hosts may
 * render a losslessly loaded unknown type. Normal custom blocks should still
 * use BlockTypeManager to install definition, renderer, and slash conversion
 * atomically.
 */
export class RendererManager implements RenderersApi {
  private readonly store = new RevisionStore();
  private readonly renderers = new Map<string, RegisteredBlockRenderer>();

  /**
   * Creates a renderer registry.
   *
   * @param registrations - Extension lifecycle owning registered contributions.
   * @param fallback - Optional renderer for persisted unknown block types.
   */
  constructor(
    private readonly registrations: RegistrationOwner,
    readonly fallback?: BlockRenderer,
  ) {}

  /**
   * Registers one renderer for a unique non-empty block type.
   *
   * @param type - Persisted block type resolved by surfaces.
   * @param renderer - React content renderer for that type.
   * @param layout - Optional Page layout removed together with this renderer.
   * @returns Idempotent disposer removing this exact renderer.
   */
  register(type: string, renderer: BlockRenderer, layout?: BlockLayout): () => void {
    this.registrations.assertActive();
    if (!type.trim()) {
      throw new Error("Block renderer type is required");
    }
    if (this.renderers.has(type)) {
      throw new Error(`Block renderer ${type} is already registered`);
    }
    const registration = new RegisteredBlockRenderer(
      type,
      renderer,
      layout,
      this.registrations,
      this.removeRegistration,
    );
    this.renderers.set(type, registration);
    try {
      this.store.changed();
    } catch (error) {
      try {
        registration.dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Renderer publication and rollback failed");
      }
      throw error;
    }
    return registration.dispose;
  }

  /**
   * Deletes the exact renderer registered for a block type.
   *
   * @param type - Persisted block type whose React renderer is removed.
   * @returns True when a renderer existed and was disposed.
   */
  delete(type: string): boolean {
    this.registrations.assertActive();
    const registration = this.renderers.get(type);
    if (!registration) {
      return false;
    }
    registration.dispose();
    return true;
  }

  /** Returns a registered renderer, configured fallback, or undefined. */
  get(type: string): BlockRenderer | undefined {
    return this.renderers.get(type)?.renderer ?? this.fallback;
  }

  /**
   * Reads concrete renderer and layout contributions without rebuilding their identities.
   *
   * Occurrences install these components directly, so mounted blocks do not need
   * intermediate host lookup components or additional host node subscriptions.
   *
   * @returns Defensive list of immutable installed registrations.
   */
  getRegistrations(): readonly BlockRendererRegistration[] {
    return [...this.renderers.values()];
  }

  /** Reports whether an exact type renderer is registered, excluding fallback. */
  has(type: string): boolean {
    return this.renderers.has(type);
  }

  /**
   * Reads the renderer registry's observable revision.
   *
   * @returns Current revision number.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes renderer registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Removes one exact registration without allowing stale disposal to remove a replacement.
   *
   * @param registration - Owned entry whose extension cleanup has started.
   * @returns The matching entry is removed and registry subscribers have been notified.
   * @throws Propagates registry subscriber failures after removal.
   */
  private readonly removeRegistration = (registration: RegisteredBlockRenderer): void => {
    if (this.renderers.get(registration.type) !== registration) {
      return;
    }
    this.renderers.delete(registration.type);
    this.store.changed();
  };
}

/** Immutable renderer identity whose cleanup belongs to the registering extension. */
class RegisteredBlockRenderer implements BlockRendererRegistration {
  /**
   * Releases this exact registration through its existing extension owner.
   *
   * @returns Registration removal has completed; subsequent calls do nothing.
   * @throws Propagates removal subscribers' failures.
   */
  readonly dispose: () => void;

  /**
   * Captures concrete presentation and installs its extension-owned cleanup.
   *
   * @param type - Validated unique native type.
   * @param renderer - Concrete content component borrowed from the host.
   * @param layout - Concrete container layout, or undefined for the standard outline.
   * @param owner - Existing extension lifecycle capturing this registration.
   * @param remove - Manager callback receiving this identity when cleanup runs.
   * @throws If the extension owner rejects registration.
   */
  constructor(
    readonly type: string,
    readonly renderer: BlockRenderer,
    readonly layout: BlockLayout | undefined,
    owner: RegistrationOwner,
    private readonly remove: (registration: RegisteredBlockRenderer) => void,
  ) {
    this.dispose = owner.registerCleanup(this.release);
    Object.freeze(this);
  }

  /**
   * Delegates removal to the registry that owns this entry's native type.
   *
   * @returns The manager has processed this exact registration identity.
   * @throws Propagates the owning manager's removal failures.
   */
  private readonly release = (): void => {
    this.remove(this);
  };
}
