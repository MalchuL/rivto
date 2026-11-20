/** Persisted embedding props; an empty target is an unconfigured reference. */
export interface EmbeddingProps extends Record<string, unknown> {
  /** Empty means search the containing document before other documents. */
  readonly targetDocumentId: string;
  readonly targetBlockId: string;
}

/** Requests shared by the settings and body of one rendered embedding. */
export interface EmbeddingEvents {
  /** Re-resolves the saved block reference without committing the settings form. */
  readonly refresh: void;
}
