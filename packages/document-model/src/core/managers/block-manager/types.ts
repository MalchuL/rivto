/** Current parent and path of one block during a hierarchy read. */
export interface BlockParentLocation {
  /** Document parent, or null for a root. */
  readonly parentId: string | null;
  /** Sibling indexes from the document root to this placement. */
  readonly path: readonly number[];
}

/** Sibling traversal state for a live hierarchy parent lookup. */
export interface BlockParentCursor {
  /** Snapshot of the current sibling array. */
  readonly ids: readonly unknown[];
  /** Next sibling index to inspect. */
  index: number;
  /** Parent shared by the siblings, or null at document root. */
  readonly parentId: string | null;
}
