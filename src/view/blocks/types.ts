import type { ComponentType, ReactNode } from "react";
import type { RivtoEditorApi } from "../../editor";
import type { EditorBlock } from "../../editor/model";
import type { SurfaceType } from "../editor/types";

/**
 * Properties supplied to a React block renderer.
 *
 * The surface owns placement and tree traversal. The block component owns only
 * the visual content for the supplied block value.
 */
export interface BlockRenderProps {
  /** Detached collaborative block value being rendered. */
  readonly block: EditorBlock;
  /** Public editor API available to trusted local renderers. */
  readonly editor: RivtoEditorApi;
  /** Surface currently rendering the block. */
  readonly surface: SurfaceType;
  /** Optional default or nested content produced by the surface. */
  readonly content?: ReactNode;
}

/**
 * Defines one React component for one block type on one surface.
 *
 * The registry stores these definitions. Rendering code resolves the component
 * and mounts it with BlockRenderProps.
 */
export interface BlockRenderer {
  /** Native block type handled by this renderer. */
  readonly blockType: string;
  /** Surface where this renderer is valid. */
  readonly surface: SurfaceType;

  /** React component that renders this block. */
  readonly component: ComponentType<BlockRenderProps>;
}
