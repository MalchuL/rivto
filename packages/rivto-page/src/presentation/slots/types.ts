import type { ComponentType } from "react";
import type { BlockEditorNodeSnapshot } from "../../adapter/types";
import type { BlockEditorNodeApi } from "../../editor/blocks/block-editor-node-api";

/** Existing perimeter anchors, ordered clockwise from the upper-left corner. */
export const SLOT_POSITIONS = [
  /** Above the row, aligned to its left edge. */
  "top-left",
  /** Above the row, horizontally centered. */
  "top",
  /** Above the row, aligned to its right edge. */
  "top-right",
  /** Outside the right edge, aligned to the row's top. */
  "right-top",
  /** Outside the right edge, vertically centered on the row. */
  "right",
  /** Outside the right edge, aligned to the row's bottom. */
  "right-bottom",
  /** Below the row, aligned to its right edge. */
  "bottom-right",
  /** Below the row, horizontally centered. */
  "bottom",
  /** Below the row, aligned to its left edge. */
  "bottom-left",
  /** Outside the left edge, aligned to the row's bottom. */
  "left-bottom",
  /** Outside the left edge, vertically centered on the row. */
  "left",
  /** Outside the left edge, aligned to the row's top. */
  "left-top",
] as const;

/**
 * A perimeter anchor, an inline row anchor, or content below the row.
 *
 * Perimeter positions are anchored to the row, not the entire block subtree.
 * They are absolutely positioned and do not reserve space in the document flow.
 * The diagram shows anchor locations; bottom slots can overlap the body/children.
 *
 * ```text
 *                top-left           top           top-right
 *                +----------------------------------------+
 * left-top       |                                        | right-top
 * left           |  start  |       content       |  end   | right
 * left-bottom    |                                        | right-bottom
 *                +----------------------------------------+
 *                bottom-left        bottom        bottom-right
 *
 *                | body                                   |
 *                |   children                             |
 * ```
 *
 * `start` and `end` participate in row layout before and after content.
 * `start` reserves the configured gutter even without matching contributions.
 * `body` participates in block layout below the row and before document children;
 * unlike the perimeter positions, it reserves space and remains when children collapse.
 */
export type BlockSlotPosition = (typeof SLOT_POSITIONS)[number] | "start" | "end" | "body";

/** Bounded render context; commands use the live node while rendering uses its snapshot. */
export interface BlockSlotProps {
  /** Borrowed ID-bound commands; its object identity survives snapshot changes. */
  readonly node: BlockEditorNodeApi;
  /** Current immutable own-node state; descendants are addressed separately. */
  readonly block: BlockEditorNodeSnapshot;
  /** Whole-block selection from the bounded host selection source. */
  readonly selected: boolean;
  /** Occurrence-local DOM ID of this owner's child container, including when collapsed. */
  readonly childrenId: string;
}

/** One extension contribution; registration does not take ownership of its component. */
export interface BlockSlotRegistration {
  /** Perimeter/row anchor or the body below the row, before document children. */
  readonly position: BlockSlotPosition;
  /** Stable component identity borrowed from the registering extension. */
  readonly component: ComponentType<BlockSlotProps>;
  /** Higher priorities appear closer to the owner; equal priorities keep registration order. */
  readonly priority?: number;
  /**
   * Filters this contribution using the current owner snapshot and selection.
   *
   * The predicate must be synchronous and side-effect free. It is reevaluated on
   * owner or registry updates. Closed-over external changes do not notify this
   * registry; observe that state inside the component or replace its registration
   * when changing an external filtering condition.
   *
   * @param props - Current bounded owner context, including its immutable snapshot.
   * @returns Whether this registration should be mounted for this owner.
   */
  readonly when?: (props: BlockSlotProps) => boolean;
}

/** Immutable registration with registry-local identity, retained across neighboring changes. */
export interface BlockSlotEntry extends BlockSlotRegistration {
  /** Registry-local key assigned once per installation, including duplicate components. */
  readonly id: number;
}
