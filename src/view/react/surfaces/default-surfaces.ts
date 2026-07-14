import { SurfaceRegistry } from "../managers/surface-registry";
import { blockSurface } from "./block-surface";
import { edgelessSurface } from "./edgeless-surface";

/** Creates a React surface registry with Rivto's built-in surfaces. */
export function createDefaultSurfaceRegistry(): SurfaceRegistry {
  const registry = new SurfaceRegistry();
  registry.register(blockSurface);
  registry.register(edgelessSurface);
  return registry;
}
