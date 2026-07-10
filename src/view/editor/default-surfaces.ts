import { SurfaceRegistry } from "../managers/surface-registry";
import { blockSurface } from "./block-surface";
import { edgelessSurface } from "./edgeless-surface";

/** Creates a surface registry with Rivto's built-in block and edgeless surfaces. */
export function createDefaultSurfaceRegistry(): SurfaceRegistry {
  const registry = new SurfaceRegistry();
  registry.register(blockSurface);
  registry.register(edgelessSurface);
  return registry;
}
