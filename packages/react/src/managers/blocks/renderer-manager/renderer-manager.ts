import type { ReactEditor } from "../../../react-editor";
import type { BlockRenderer } from "./types";

/**
 * Owns React content renderers indexed by persisted block type.
 *
 * Renderer storage is independent from core block definitions so hosts may
 * render a losslessly loaded unknown type. Normal custom blocks should still
 * use BlockManager to install definition, renderer, and slash conversion
 * atomically.
 */
export class RendererManager {
  private readonly renderers = new Map<string, {
    readonly renderer: BlockRenderer;
    dispose: () => void;
  }>();

  /**
   * Creates a renderer registry.
   *
   * @param reactEditor - Complete owning runtime used for lifecycle ownership
   * and React invalidation.
   * @param fallback - Optional renderer for persisted unknown block types.
   */
  constructor(
    private readonly reactEditor: ReactEditor,
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
    this.reactEditor.plugins.assertActive();
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
    this.reactEditor.invalidate();
    registration.dispose = this.reactEditor.plugins.own(() => {
      if (this.renderers.get(type) !== registration) return;
      this.renderers.delete(type);
      this.reactEditor.invalidate();
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
    this.reactEditor.plugins.assertActive();
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
}
