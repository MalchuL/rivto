import type { ComponentType, ReactNode } from "react";
import type { RivtoEditorApi, EditorMode } from "../../editor";
import type { EditorBlock } from "../../editor/model";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";

/**
 * Local surface layout used by the view layer.
 *
 * It mirrors editor mode, but stays named from the renderer point of view:
 * a surface is where blocks are placed, while mode is runtime state.
 */
export type SurfaceType = EditorMode;

/**
 * Properties supplied to a React surface component.
 *
 * A surface owns document-level layout. It receives the editor and block
 * renderer registry so it can decide what document data it needs for layout.
 */
export interface SurfaceRenderProps {
  /** Editor runtime that owns document data, commands, blocks, mode, and history. */
  readonly editor: RivtoEditorApi;
  /** Renderers available for individual block content. */
  readonly renderers: BlockRendererRegistry;
  /** Optional default block renderer used when no custom block renderer exists. */
  readonly fallback?: (block: EditorBlock) => ReactNode;
}

/**
 * Renders the whole document for one layout mode.
 *
 * Surfaces own document-level layout: vertical block tree, edgeless canvas,
 * or another future placement strategy. They delegate individual block content
 * to block renderers through the context.
 */
export interface Surface {
  /** Surface layout handled by this renderer. */
  readonly type: SurfaceType;
  /** React component that renders the whole document for this surface. */
  readonly component: ComponentType<SurfaceRenderProps>;
}
