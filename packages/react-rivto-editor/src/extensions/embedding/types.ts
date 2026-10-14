/** Persisted address of a block; block IDs are unique only within their document. */
export interface BlockReference {
  readonly documentId: string;
  readonly blockId: string;
}

/** Resolved address for display; ambiguity does not prevent the default resolver choosing a source. */
export interface BlockResolution {
  readonly documentId?: string;
  readonly ambiguous: boolean;
}
