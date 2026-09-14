/**
 * Public data contracts for collaborative block and element comments.
 *
 * Threads live in document plugin data rather than block snapshots so copying
 * content does not duplicate discussions. Anchors retain stable document IDs,
 * while messages carry optional attribution supplied by the host application.
 *
 * @module
 */

/** Optional identity recorded on newly created comment messages. */
export interface CommentAuthor {
  /** Stable host-owned account identifier. */
  readonly id: string;
  /** Human-readable name shown beside the message. */
  readonly name: string;
}

/** Persisted object to which a comment thread is attached. */
export interface CommentAnchor {
  /** Supported document object family; links are intentionally deferred. */
  readonly type: "block" | "element";
  /** Stable block or first-class element identifier. */
  readonly id: string;
}

/** One root comment or reply in a thread. */
export interface CommentMessage {
  /** Stable message identifier. */
  readonly id: string;
  /** Plain-text message body. */
  readonly content: string;
  /** Optional host-supplied author snapshot. */
  readonly author?: CommentAuthor;
  /** Creation time as Unix milliseconds. */
  readonly createdAt: number;
  /** Last edit time as Unix milliseconds, omitted before the first edit. */
  readonly updatedAt?: number;
}

/** Collaborative discussion attached to one or more selected objects. */
export interface CommentThread {
  /** Stable thread identifier and plugin-map record key. */
  readonly id: string;
  /** Ordered, deduplicated document anchors. */
  readonly anchors: readonly CommentAnchor[];
  /** Root message followed by replies in creation order. */
  readonly messages: readonly CommentMessage[];
  /** Whether new replies are disabled and the UI is collapsed. */
  readonly resolved: boolean;
  /** Thread creation time as Unix milliseconds. */
  readonly createdAt: number;
}

/** Local, unpersisted composer opened for a block or element selection. */
export interface CommentDraft {
  /** Anchors that will receive the thread after submission. */
  readonly anchors: readonly CommentAnchor[];
}

/** Creation options for the comments extension. */
export interface CommentsExtensionOptions {
  /** Author copied onto new messages; null and undefined create anonymous messages. */
  readonly author?: CommentAuthor | null;
}
