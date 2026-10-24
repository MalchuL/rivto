/** A stable block ID and concrete UTF-16 offset. */
export interface BlockSelectionPosition {
  readonly blockId: string;
  readonly offset: number;
}
/** Stored coverage; end -1 means the current live end of a whole block. */
export interface BlockSelectionRange {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
/** Directed block/text selection in canonical visible order, without canvas metadata. */
export interface BlockSelectionSnapshot {
  readonly type: "selection";
  readonly blocks: readonly BlockSelectionRange[];
  readonly anchorBlockId?: string;
  readonly focusBlockId?: string;
  readonly reversed?: boolean;
}
