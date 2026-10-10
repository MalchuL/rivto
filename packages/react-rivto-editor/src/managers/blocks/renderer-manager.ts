import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type { BlockRenderer } from "./renderer-types";
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
  private readonly renderers = new Map<string, {
    readonly renderer: BlockRenderer;
    dispose: () => void;
  }>();

  /**
   * Creates a renderer registry.
   *
   * @param registrations - Extension lifecycle owning registered contributions.
   * @param fallback - Optional renderer for persisted unknown block types.
   */
  constructor(
    private readonly registrations: RegistrationOwner,
    private readonly fallback?: BlockRenderer,
  ) {}

  /**
   * Registers one renderer for a unique non-empty block type.
   *
   * @param type - Persisted block type resolved by surfaces.
   * @param renderer - React content renderer for that type.
   * @returns Idempotent disposer removing this exact renderer.
   */
  register(type: string, renderer: BlockRenderer): () => void {
    this.registrations.assertActive();
    if (!type.trim()) throw new Error("Block renderer type is required");
    if (this.renderers.has(type)) throw new Error(`Block renderer ${type} is already registered`);
    const registration: {
      readonly renderer: BlockRenderer;
      dispose: () => void;
    } = {
      renderer,
      dispose: () => undefined,
    };
    this.renderers.set(type, registration);
    this.store.changed();
    registration.dispose = this.registrations.own(() => {
      if (this.renderers.get(type) !== registration) return;
      this.renderers.delete(type);
      this.store.changed();
    });
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
    if (!registration) return false;
    registration.dispose();
    return true;
  }

  /** Returns a registered renderer, configured fallback, or undefined. */
  get(type: string): BlockRenderer | undefined {
    return this.renderers.get(type)?.renderer ?? this.fallback;
  }

  /** Reports whether an exact type renderer is registered, excluding fallback. */
  has(type: string): boolean {
    return this.renderers.has(type);
  }

  get revision(): number {
    return this.store.revision;
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
}
