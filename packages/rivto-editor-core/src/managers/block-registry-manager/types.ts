import type { ZodType } from "zod";

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own data rules: the persisted native type, user-facing title,
 * default properties, and optional property validation. Presentation lives in
 * renderer definitions so the same block model can be rendered by DOM, canvas,
 * server HTML, or another bridge without importing UI framework types here.
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
  /**
   * Optional parent-type constraint checked at insert, move, and load.
   *
   * Omitted means any parent, including the document root. `null` in the list
   * allows a root placement. Unknown types have no constraint.
   */
  allowedParents?: readonly (string | null)[];
}
