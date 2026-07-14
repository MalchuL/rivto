import type { ComponentType, ReactNode } from "react";
import type { RivtoEditorApi, EditorMode } from "../../../editor";
import type { EditorBlock } from "../../../editor/model";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";

/** React surface layout type. */
export type SurfaceType = EditorMode;

/** Properties supplied to a React surface component. */
export interface SurfaceRenderProps {
  /** Editor runtime that owns document state, commands, mode, and selection. */
  readonly editor: RivtoEditorApi;
  /** Registered block renderers available to the surface. */
  readonly renderers: BlockRendererRegistry;
  /** Optional fallback for blocks without a registered renderer. */
  readonly fallback?: (block: EditorBlock) => ReactNode;
}

/**
 * Renders the whole document for one React layout mode.
 *
 * A surface owns document-level layout. Individual block renderers own only
 * the visible content for one block.
 */
export interface Surface {
  /** Surface layout handled by this renderer. */
  readonly type: SurfaceType;
  /** React component that renders the whole document for this surface. */
  readonly component: ComponentType<SurfaceRenderProps>;
}
