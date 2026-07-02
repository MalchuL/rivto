import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
import type { Block, BlockInput } from "../../store/document-model";
import type { RivtoEditorApi } from "../editor/types";

/** Properties supplied to a React renderer owned by a block definition. */
export interface BlockRenderProps {
  /** Detached collaborative block value being rendered. */
  block: Block;
  /** Public editor commands available to trusted local extensions. */
  editor: RivtoEditorApi;
  /** Default editable content produced by Rivto. */
  content: ReactNode;
}

/** Describes a slash-menu action contributed by a block or plugin. */
export interface SlashItem {
  /** Human-readable menu label. */
  title: string;
  /** Additional search terms. */
  aliases?: string[];
  /** Optional visual grouping label. */
  group?: string;
  /** Block type and initial data inserted by the default action. */
  block?: BlockInput;
  /** Custom action used instead of default block insertion. */
  run?: (editor: RivtoEditorApi, blockId: string) => void;
}

/** Slash-menu metadata attached to a registered block type. */
export type BlockSlashDefinition = Omit<SlashItem, "block" | "run">;

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
  /** Optional React presentation around Rivto's default content. */
  render?: ComponentType<BlockRenderProps>;
  /** Optional entry generated for the slash menu. */
  slash?: BlockSlashDefinition;
}
