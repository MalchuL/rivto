import type { Surface, SurfaceType } from "../editor/types";

/**
 * Stores React surface components by surface type.
 *
 * A surface owns document-level layout, so there can be only one component for
 * a given surface type in one registry instance.
 */
export class SurfaceRegistry {
  private readonly surfaces = new Map<SurfaceType, Surface>();

  /**
   * Registers one surface component.
   *
   * @param surface - Surface definition for one layout type.
   * @returns Idempotent function that removes this exact surface.
   * @throws If another surface already owns the same type.
   */
  register(surface: Surface): () => void {
    if (this.surfaces.has(surface.type)) {
      throw new Error(`Surface already registered for ${surface.type}`);
    }

    this.surfaces.set(surface.type, surface);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.surfaces.get(surface.type) === surface) this.surfaces.delete(surface.type);
    };
  }

  /**
   * Finds the registered surface for one layout type.
   *
   * @param type - Surface layout type.
   * @returns Matching surface, or undefined when none is registered.
   */
  get(type: SurfaceType): Surface | undefined {
    return this.surfaces.get(type);
  }
}
