import { createContext, useContext } from "react";
import type { BlockEditorNodeApi } from "../../../editor/blocks/block-editor-node-api";
import type { BlockEditorNodeSnapshot } from "../../../adapter/types";
import type { BlockSlotEntry } from "../../slots/types";

/** Own-node data, selection, and slots shared by layout primitives without waking layout composition. */
export interface BlockLayoutState {
  /** Stable borrowed node for one mounted occurrence, independent of its changing data. */
  readonly node: BlockEditorNodeApi;
  /** Stable child-host DOM ID for this mounted occurrence. */
  readonly childrenId: string;
  readonly block: BlockEditorNodeSnapshot;
  readonly selected: boolean;
  readonly entries: readonly BlockSlotEntry[];
}

/** Structural child changes are independent of block presentation and slot publications. */
export interface BlockChildrenState {
  readonly blockId: string;
  readonly childIds: readonly string[];
  readonly childrenId: string;
  readonly collapsed: boolean;
}

/** Structure-only context retains identity during text, color, selection, and slot updates. */
export const BlockChildrenContext = createContext<BlockChildrenState | null>(null);

/** Snapshot notifications target primitive consumers rather than their parent layout. */
export const BlockLayoutContext = createContext<BlockLayoutState | null>(null);

/**
 * Reads the current block layout state shared by primitive consumers.
 *
 * @returns Own-node fields, selection, and slot registrations for this occurrence.
 * @throws If the primitive is rendered outside a block layout.
 */
export function useBlockLayoutState(): BlockLayoutState {
  const layoutState = useContext(BlockLayoutContext);
  if (!layoutState) {
    throw new Error("Block layout primitives require block layout state");
  }
  return layoutState;
}

/**
 * Observes only child order and collapse changes for this layout occurrence.
 *
 * @returns Stable structural fields without subscribing to block presentation or slot entries.
 * @throws If the primitive is rendered outside a block layout.
 */
export function useBlockChildrenState(): BlockChildrenState {
  const state = useContext(BlockChildrenContext);
  if (!state) {
    throw new Error("BlockChildren requires a block layout");
  }
  return state;
}
