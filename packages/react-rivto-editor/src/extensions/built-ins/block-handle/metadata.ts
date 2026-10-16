/** Extension identifier used as the metadata namespace for universal-handle presentation. */
export const BLOCK_HANDLE_METADATA_KEY = "block.handle";

/** DOM marker owned by universal-handle hover presentation, independently of dragging. */
export const BLOCK_HANDLE_CONTAINER_ATTRIBUTE = "data-block-handle-container";

/** Optional per-type presentation parameters owned by block.handle. */
export interface BlockHandleMetadata {
  /** Reveals the owning handle across the complete container. Defaults to false. */
  readonly showOnContainerHover?: boolean;
}
