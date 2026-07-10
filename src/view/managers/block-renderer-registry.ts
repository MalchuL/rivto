import type { BlockRenderer } from "../blocks/types";
import type { SurfaceType } from "../editor/types";

/**
 * Stores React block renderers by block type and surface.
 *
 * The registry is deliberately exact: a renderer registered for `paragraph`
 * on the block surface is not reused for edgeless rendering unless it is
 * explicitly registered there too.
 */
export class BlockRendererRegistry {
  private readonly renderers = new Map<string, BlockRenderer>();

  /**
   * Registers one block renderer.
   *
   * @param renderer - Renderer for one native block type on one surface.
   * @returns Idempotent function that removes this exact renderer.
   * @throws If the block type is empty or another renderer already owns the same key.
   */
  register(renderer: BlockRenderer): () => void {
    const key = this.key(renderer.blockType, renderer.surface);
    if (this.renderers.has(key)) {
      throw new Error(`Renderer already registered for ${renderer.surface}:${renderer.blockType}`);
    }

    this.renderers.set(key, renderer);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.renderers.delete(key);
    };
  }

  /**
   * Finds the renderer for one block type on one surface.
   *
   * @param blockType - Native block type persisted in the document.
   * @param surface - Surface that will render the block.
   * @returns Matching renderer, or undefined when none is registered.
   */
  get(blockType: string, surface: SurfaceType): BlockRenderer | undefined {
    return this.renderers.get(this.key(blockType, surface));
  }

  private key(blockType: string, surface: SurfaceType): string {
    const normalizedBlockType = blockType.trim();
    if (!normalizedBlockType) throw new Error("Renderer block type must be a non-empty string");
    return `${surface}:${normalizedBlockType}`;
  }
}
