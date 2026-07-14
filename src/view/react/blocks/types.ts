import type { ComponentType, ReactNode } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { EditorBlock } from "../../../editor/model";
import type { SurfaceType } from "../editor/types";

/** Properties supplied to a React block renderer. */
export interface BlockRenderProps {
  /** Detached block value being rendered. */
  readonly block: EditorBlock;
  /** Editor API available to trusted local renderers. */
  readonly editor: RivtoEditorApi;
  /** Surface currently rendering the block. */
  readonly surface: SurfaceType;
  /** Nested child content produced by the surface. */
  readonly content?: ReactNode;
}

/** Defines one React component for one block type on one surface. */
export interface BlockRenderer {
  /** Native block type handled by this renderer. */
  readonly blockType: string;
  /** Surface where this renderer is valid. */
  readonly surface: SurfaceType;
  /** React component that renders this block. */
  readonly component: ComponentType<BlockRenderProps>;
}
