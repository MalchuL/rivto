import type { ZodType } from "zod";

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own data rules: the persisted native type, user-facing title,
 * default properties, optional property validation, parent constraints, and
 * opaque runtime metadata. Presentation lives in renderer definitions so the same
 * block model can be rendered by DOM, canvas, server HTML, or another bridge
 * without importing UI framework types here.
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
  /**
   * Optional runtime annotations owned and interpreted by higher layers.
   *
   * Core stores this object with the definition but does not inspect it. It is
   * not persisted with blocks. Omission avoids allocating storage for block
   * types without higher-layer annotations.
   */
  metadata?: Readonly<Record<string, unknown>>;
}
