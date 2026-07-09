import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
import type { EditorMode, RivtoEditorApi } from "../editor/types";
import type { EditorBlock } from "../editor/model";

/** Properties supplied to a React renderer owned by a block definition. */
export interface BlockRenderProps {
  /** Detached collaborative block value being rendered. */
  block: EditorBlock;
  /** Public editor runtime available to trusted local extensions. */
  editor: RivtoEditorApi;
  /** Default editable content produced by Rivto. */
  content: ReactNode;
}

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own validation and presentation. They describe block behavior
 * without owning storage.
 */
export interface BlockDefinition<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable native type persisted in every block record. */
  type: string;
  /** Human-readable name used by accessible UI. */
  title?: string;
  /** Properties merged into caller data during editor-level creation. */
  defaultProps?: Partial<Props>;
  /** Runtime validator for the complete property object. */
  propSchema?: ZodType<Props>;
  /** Shared or mode-specific React presentation around Rivto's default content. */
  render?: ComponentType<BlockRenderProps> | Partial<Record<EditorMode, ComponentType<BlockRenderProps>>>;
}
