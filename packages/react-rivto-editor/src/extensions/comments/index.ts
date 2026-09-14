/** Public entrypoint for collaborative block and element comments. @module */
export { CommentsExtension, commentsExtension } from "./comments";
export { COMMENTS_PLUGIN_ID } from "./controller";
export type {
  CommentAnchor,
  CommentAuthor,
  CommentDraft,
  CommentMessage,
  CommentsExtensionOptions,
  CommentThread,
} from "./types";
