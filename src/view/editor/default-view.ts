import { createDefaultBlockRendererRegistry } from "../blocks/default-renderers";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceRegistry } from "../managers/surface-registry";
import { createDefaultSurfaceRegistry } from "./default-surfaces";

/** Default registries needed by EditorView for built-in rendering. */
export interface DefaultViewRegistries {
  /** Built-in block and edgeless surfaces. */
  readonly surfaces: SurfaceRegistry;
  /** Built-in block renderers for default runtime block definitions. */
  readonly renderers: BlockRendererRegistry;
}

/** Creates the default view registries for a basic Rivto editor view. */
export function createDefaultViewRegistries(): DefaultViewRegistries {
  return {
    surfaces: createDefaultSurfaceRegistry(),
    renderers: createDefaultBlockRendererRegistry(),
  };
}
