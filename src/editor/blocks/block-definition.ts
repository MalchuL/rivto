import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
import type { Block } from "../../store/document-model";
import type { EditorMode, RivtoEditorApi } from "../editor/types";

/** Properties supplied to a React renderer owned by a block definition. */
export interface BlockRenderProps {
  /** Detached collaborative block value being rendered. */
  block: Block;
  /** Public editor commands available to trusted local extensions. */
  editor: RivtoEditorApi;
  /** Default editable content produced by Rivto. */
  content: ReactNode;
}

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own validation and presentation. Collaborative values remain in
 * DocumentModelImpl, so definitions never receive native CRDT objects.
 */
export interface BlockDefinition<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable native type persisted in every block record. */
  type: string;
  /** Whether the block owns editable inline text. */
  content: "inline" | "none";
  /** Human-readable name used by accessible UI. */
  title?: string;
  /** Properties merged into caller data during editor-level creation. */
  defaultProps?: Partial<Props>;
  /** Runtime validator for the complete property object. */
  propSchema?: ZodType<Props>;
  /** Shared or mode-specific React presentation around Rivto's default content. */
  render?: ComponentType<BlockRenderProps> | Partial<Record<EditorMode, ComponentType<BlockRenderProps>>>;
}
