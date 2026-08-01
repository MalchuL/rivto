import type { ZodType } from "zod";
import type { EditorBlock } from "../editor/model";

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own data rules: the persisted native type, user-facing title,
 * default properties, optional property validation, and portable clipboard
 * text. Presentation lives in renderer definitions so the same block model can
 * be rendered by DOM, canvas, server HTML, or another bridge without importing
 * UI framework types here.
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
  /** Converts one detached block to portable clipboard text. Used for clipboard copy to paste to different apps. 
   * If not provided, block.content will be used.
  */
  toRawText?: (block: EditorBlock) => string;
}
