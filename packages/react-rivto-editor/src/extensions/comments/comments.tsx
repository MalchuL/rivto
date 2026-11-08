import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DocumentModel } from "@chulane/document-model";
import { useReactPanel } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import {
  createSideBlock,
  deleteSideBlock,
  updateSideBlockData,
  type SideBlock,
} from "../side-blocks/side-blocks-store";
import { useSideBlocks } from "../side-blocks/use-side-blocks";
import type { SideBlockRendererProps } from "../side-blocks/side-blocks";
import { useEdgelessSelection } from "../built-ins/selection/edgeless-runtime";

/** Persisted side-block type for a comment thread. */
export const COMMENT_SIDE_BLOCK_TYPE = "comment";
/** Prefix for thread-specific namespaces whose fields hold comment messages. */
const COMMENT_MESSAGES_PLUGIN_ID = "rivto.comment-messages.";

/** Reads a thread's messages and observes document changes. */
interface CommentMessageReader {
  /** Reads one detached message namespace. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "get">;
  /**
   * Observes document changes while this reader is mounted.
   *
   * @param listener - Callback invoked after document data changes.
   * @returns Disposer removing this listener.
   */
  readonly subscribe: DocumentModel["subscribe"];
}

/** Writes one message through document history. */
interface CommentMessageWriter {
  /** Replaces one independently collaborative message field. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "setField">;
  /** Groups changes in document history. */
  readonly history: Pick<DocumentModel["history"], "batchUpdates">;
}

/** Writes or deletes individual messages. */
interface CommentMessageStorage extends CommentMessageWriter {
  /** Replaces or deletes one message field. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "setField" | "deleteField">;
}

/** Removes a thread's message namespace through document history. */
interface CommentThreadDeleter {
  /** Deletes the thread's message namespace. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "delete">;
  /** Groups thread and message removal in document history. */
  readonly history: Pick<DocumentModel["history"], "batchUpdates">;
}

/** Anchor and storage operations needed to create a thread. */
interface CommentThreadCreator {
  /** Reads and writes side records and initializes the message map. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "get" | "set" | "setField">;
  /** Groups thread and message-map creation in document history. */
  readonly history: Pick<DocumentModel["history"], "batchUpdates">;
  /** Checks block anchors. */
  readonly blocks: Pick<DocumentModel["blocks"], "hasBlock">;
  /** Checks canvas element anchors. */
  readonly elements: Pick<DocumentModel["elements"], "hasElement">;
}

/** Optional host-provided identity recorded on new comments. */
export interface CommentAuthor {
  /** Stable host account ID. */
  readonly id: string;
  /** Display name captured when a message is created. */
  readonly name: string;
}

/** One independently stored message belonging to a comment thread. */
export interface CommentMessage {
  /** Stable message ID. */
  readonly id: string;
  /** Side-block ID of the containing thread. */
  readonly threadId: string;
  /** Plain-text message content. */
  readonly content: string;
  /** Time of creation in Unix milliseconds. */
  readonly createdAt: number;
  /** Author captured at creation, when supplied by the host. */
  readonly author?: CommentAuthor;
}

/** Options for the comments extension. */
export interface CommentsOptions {
  /** Optional author for messages created by this editor. */
  readonly author?: CommentAuthor;
}

/**
 * Creates a comment renderer for the shared side-block presentation.
 *
 * Thread and message records use separate plugin-data fields. Concurrent edits to
 * distinct messages therefore do not replace the whole thread's message list.
 *
 * @param options - Optional author for newly submitted messages.
 * @returns A renderer to register under COMMENT_SIDE_BLOCK_TYPE.
 */
export function createCommentSideBlockRenderer(options: CommentsOptions = {}) {
  /**
   * Renders a comment thread using this installation's author identity.
   *
   * @param props - Current thread record and its persistence operations.
   * @returns Editable comment thread controls.
   */
  function CommentRenderer(props: SideBlockRendererProps) {
    return <CommentThread {...props} author={options.author} />;
  }
  return CommentRenderer;
}

/**
 * Registers the slash command that creates comment side blocks.
 *
 * The host also registers a renderer under COMMENT_SIDE_BLOCK_TYPE with
 * sideBlocksExtension; the command uses the invoking panel's document.
 *
 * @param options - Optional author for canvas messages.
 * @returns An extension registering the comment command and canvas sidebar.
 */
export function commentsExtension(options: CommentsOptions = {}): ReactEditorExtension {
  /**
   * Keeps canvas comments outside the transformed canvas and its selection root.
   *
   * @param props - The existing canvas subtree.
   * @param props.children - Existing canvas and extensions.
   * @returns Canvas with a comment sidebar, or its unchanged embedded view.
   */
  function CanvasCommentsBoundary({ children }: { readonly children?: ReactNode }) {
    const panel = useReactPanel();
    if (panel.blocks.includeRoot) {
      return children;
    }
    return <CanvasComments author={options.author}>{children}</CanvasComments>;
  }
  return {
    id: "comments",
    setup: (editor) => {
      const releaseSidebar = editor.surfaces.registerEditorWrapper(
        CanvasCommentsBoundary,
        "edgeless",
      );
      const releaseCommand = editor.slashCommands.register({
        id: "comment.create",
        title: "Comment",
        group: "Actions",
        keywords: ["discussion", "reply"],
        isAvailable: ({ reactPanel, blockId }) =>
          reactPanel.getSurfaceType() === "block" &&
          !reactPanel.blocks.includeRoot &&
          reactPanel.editor.getDocument().blocks.hasBlock(blockId),
        execute: ({ reactPanel, blockId }) => {
          createCommentThread(reactPanel.editor.getDocument(), blockId, "block");
        },
      });
      return () => {
        releaseCommand();
        releaseSidebar();
      };
    },
  };
}

/** Props for the independent canvas comments sidebar. */
interface CanvasCommentsProps extends CommentsOptions {
  /** Existing canvas subtree. */
  readonly children?: ReactNode;
}

/**
 * Renders comment threads alongside the canvas and can anchor one to its selection.
 *
 * @param props - Canvas content and optional comment author.
 * @param props.children - Existing canvas subtree.
 * @param props.author - Author copied to new messages.
 * @returns Canvas and independently interactive comments sidebar.
 */
function CanvasComments({ children, author }: CanvasCommentsProps) {
  const { editor } = useReactPanel();
  const document = editor.getDocument();
  const selection = useEdgelessSelection();
  const sideBlocks = useSideBlocks(document);
  const threads = sideBlocks.filter((block) => block.type === COMMENT_SIDE_BLOCK_TYPE);
  const selected = selection.active
    ? selection.items.find((id) => document.elements.hasElement(id))
    : undefined;
  return (
    <div className="rivto-canvas-comments">
      <div className="rivto-canvas-comments-content">{children}</div>
      <aside
        className="rivto-canvas-comments-sidebar"
        data-comment-sidebar
        data-edgeless-ui
        aria-label="Comments"
      >
        <div className="rivto-comment-actions">
          <strong>Comments</strong>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                createCommentThread(document, selected, "element");
              }
            }}
          >
            Comment on selection
          </button>
        </div>
        {threads.map((block) => (
          <CommentThread
            key={block.id}
            block={block}
            author={author}
            update={(data) => updateSideBlockData(document, block.id, data)}
            remove={() => deleteSideBlock(document, block.id)}
          />
        ))}
      </aside>
    </div>
  );
}

/**
 * Creates a thread and its shared message map as one history operation.
 *
 * @param document - Document owning the anchor and comments.
 * @param anchorId - Existing block or element ID.
 * @param anchorType - Family of the anchored object.
 * @returns The newly persisted thread record.
 * @throws If the anchor does not exist or plugin data cannot be stored.
 */
function createCommentThread(
  document: CommentThreadCreator,
  anchorId: string,
  anchorType: "block" | "element",
): SideBlock {
  return document.history.batchUpdates(() => {
    const thread = createSideBlock(document, {
      anchorId,
      anchorType,
      type: COMMENT_SIDE_BLOCK_TYPE,
      data: { resolved: false },
    });
    // Materialize this map with the thread so concurrent first replies merge.
    document.pluginData.setField(`${COMMENT_MESSAGES_PLUGIN_ID}${thread.id}`, "created", true);
    return thread;
  });
}

/** Props for a comment side-block component. */
interface CommentThreadProps extends SideBlockRendererProps {
  /** Optional identity copied to new messages. */
  readonly author?: CommentAuthor;
}

/** Persistent thread state, separate from its independently stored messages. */
interface CommentThreadData {
  /** Whether replies and editing are disabled. */
  readonly resolved: boolean;
  /** Stable first-message identity, omitted before the first submission. */
  readonly rootMessageId?: string;
}

/**
 * Shows one thread and edits its independent message records.
 *
 * @param props - Side-block operations and optional author.
 * @param props.block - Persisted thread anchor and state.
 * @param props.update - Replaces the thread state.
 * @param props.remove - Removes the thread record.
 * @param props.author - Identity copied onto new messages.
 * @returns A thread with message, reply, resolve, and delete controls.
 */
function CommentThread({ block, update, remove, author }: CommentThreadProps) {
  const { editor } = useReactPanel();
  const document = editor.getDocument();
  const messagesId = `${COMMENT_MESSAGES_PLUGIN_ID}${block.id}`;
  const thread = readThreadData(block);
  const messages = useCommentMessages(document, messagesId, block.id);
  const ordered = orderCommentMessages(messages, thread.rootMessageId);
  const resolved = thread.resolved;

  const deleteThread = () => deleteCommentThread(document, messagesId, remove);

  return (
    <section
      className="rivto-comment"
      data-comment-thread-id={block.id}
      data-comment-resolved={resolved}
      aria-label="Comment thread"
    >
      <header className="rivto-comment-actions">
        <strong>Comment</strong>
        <button type="button" onClick={() => update({ ...thread, resolved: !resolved })}>
          {resolved ? "Reopen" : "Resolve"}
        </button>
        <button type="button" onClick={deleteThread}>
          Delete thread
        </button>
      </header>
      <CommentMessages
        document={document}
        messagesId={messagesId}
        messages={ordered}
        resolved={resolved}
        deleteThread={deleteThread}
      />
      {!resolved && (
        <CommentComposer
          document={document}
          messagesId={messagesId}
          threadId={block.id}
          author={author}
          hasMessages={messages.length > 0}
          onFirstMessage={(id) => update({ ...thread, rootMessageId: id })}
        />
      )}
    </section>
  );
}

/**
 * Removes a thread and its message namespace in one history operation.
 *
 * @param document - Document owning the messages and history.
 * @param messagesId - Thread-specific message namespace.
 * @param remove - Deletes the thread's side-block record.
 * @returns Deletes the thread and its messages.
 */
function deleteCommentThread(
  document: CommentThreadDeleter,
  messagesId: string,
  remove: () => boolean,
): void {
  document.history.batchUpdates(() => {
    document.pluginData.delete(messagesId);
    remove();
  });
}

/** Inputs for one thread's ordered messages. */
interface CommentMessagesProps {
  /** Document supplying message persistence and history. */
  readonly document: CommentMessageStorage;
  /** Thread-specific message namespace. */
  readonly messagesId: string;
  /** Ordered messages, with the root first when it exists. */
  readonly messages: readonly CommentMessage[];
  /** Whether editing is disabled. */
  readonly resolved: boolean;
  /**
   * Removes the thread and all of its messages.
   *
   * @returns Completes the thread deletion.
   */
  readonly deleteThread: () => void;
}

/**
 * Renders thread messages and applies root-versus-reply deletion behavior.
 *
 * @param props - Document, ordered messages, and thread deletion operation.
 * @param props.document - Document receiving reply deletion.
 * @param props.messagesId - Thread-specific namespace.
 * @param props.messages - Messages with the root first.
 * @param props.resolved - Whether message editing is disabled.
 * @param props.deleteThread - Deletes the root and entire thread.
 * @returns Message components with independent reply deletion.
 */
function CommentMessages({
  document,
  messagesId,
  messages,
  resolved,
  deleteThread,
}: CommentMessagesProps) {
  return messages.map((message, index) => (
    <CommentMessageView
      key={message.id}
      message={message}
      document={document}
      messagesId={messagesId}
      resolved={resolved}
      onDelete={() => {
        if (index === 0) {
          deleteThread();
        } else {
          document.history.batchUpdates(() =>
            document.pluginData.deleteField(messagesId, message.id),
          );
        }
      }}
    />
  ));
}

/**
 * Moves the identified root ahead of replies while preserving reply ordering.
 *
 * @param messages - Messages ordered by creation time and ID.
 * @param rootId - Persisted root identity, if one has been submitted.
 * @returns Root-first messages, or the supplied order when the root is missing.
 */
function orderCommentMessages(
  messages: readonly CommentMessage[],
  rootId?: string,
): readonly CommentMessage[] {
  const root = messages.find((message) => message.id === rootId);
  return root ? [root, ...messages.filter((message) => message.id !== rootId)] : messages;
}

/**
 * Subscribes to one thread's independently stored messages.
 *
 * @param document - Borrowed document containing the message namespace.
 * @param messagesId - Thread-specific plugin namespace.
 * @param threadId - Thread identity used to validate stored messages.
 * @returns Current detached messages in creation order.
 */
function useCommentMessages(
  document: CommentMessageReader,
  messagesId: string,
  threadId: string,
): CommentMessage[] {
  const subscribe = useCallback((listener: () => void) => document.subscribe(listener), [document]);
  const getSnapshot = useCallback(
    () => JSON.stringify(document.pluginData.get(messagesId) ?? {}),
    [document, messagesId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => readMessages(snapshot, threadId), [snapshot, threadId]);
}

/** Props for a single editable comment message. */
interface CommentMessageViewProps {
  /** Document borrowed for history and message mutations. */
  readonly document: CommentMessageWriter;
  /** Thread-specific message namespace. */
  readonly messagesId: string;
  /** Current detached message. */
  readonly message: CommentMessage;
  /** Resolved threads do not allow editing. */
  readonly resolved: boolean;
  /**
   * Removes the message, or the thread when it is the first message.
   *
   * @returns Completes the corresponding document mutation.
   */
  readonly onDelete: () => void;
}

/**
 * Displays and edits one independently collaborative message.
 *
 * @param props - Message, resolution state, and document mutation context.
 * @param props.document - Document owning the message.
 * @param props.messagesId - Thread-specific message namespace.
 * @param props.message - Current detached message.
 * @param props.resolved - Whether editing is disabled.
 * @param props.onDelete - Removes the message or its thread.
 * @returns Message content with edit and delete controls.
 */
function CommentMessageView({
  document,
  messagesId,
  message,
  resolved,
  onDelete,
}: CommentMessageViewProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rivto-comment-message" data-comment-message-id={message.id}>
      {message.author && <strong>{message.author.name}</strong>}
      {editing ? (
        <CommentMessageEditor
          document={document}
          messagesId={messagesId}
          message={message}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <p>{message.content}</p>
          {!resolved && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button type="button" onClick={onDelete}>
            Delete message
          </button>
        </>
      )}
    </div>
  );
}

/** Inputs for editing an existing message. */
interface CommentMessageEditorProps {
  /** Document receiving the edit. */
  readonly document: CommentMessageWriter;
  /** Thread-specific message namespace. */
  readonly messagesId: string;
  /** Message whose content is being edited. */
  readonly message: CommentMessage;
  /**
   * Closes this editor after save or cancellation.
   *
   * @returns Restores the message display.
   */
  readonly onClose: () => void;
}

/**
 * Edits one message and saves its replacement text through document history.
 *
 * @param props - Message, document, and editor-close callback.
 * @param props.document - Document receiving the edit.
 * @param props.messagesId - Thread-specific message namespace.
 * @param props.message - Detached message being edited.
 * @param props.onClose - Closes the editor after save or cancellation.
 * @returns A text editor with save and cancel controls.
 */
function CommentMessageEditor({
  document,
  messagesId,
  message,
  onClose,
}: CommentMessageEditorProps) {
  const [draft, setDraft] = useState(message.content);
  /**
   * Saves the replacement text and closes the editor.
   *
   * @returns Replaces the message's content through document history.
   */
  function save() {
    document.history.batchUpdates(() =>
      document.pluginData.setField(messagesId, message.id, { ...message, content: draft.trim() }),
    );
    onClose();
  }
  return (
    <>
      <textarea
        aria-label="Edit comment"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="button" disabled={!draft.trim()} onClick={save}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </>
  );
}

/** Props for the new-message composer. */
interface CommentComposerProps extends CommentsOptions {
  /** Document receiving the message. */
  readonly document: CommentMessageWriter;
  /** Thread-specific message namespace. */
  readonly messagesId: string;
  /** Side-block identity of the thread. */
  readonly threadId: string;
  /** Whether the form creates a reply rather than the first message. */
  readonly hasMessages: boolean;
  /**
   * Records the first message as the root of this thread.
   *
   * @param id - Identity of the message being created.
   * @returns Updates the thread's root identity.
   */
  readonly onFirstMessage: (id: string) => void;
}

/**
 * Creates a new independent message for a thread.
 *
 * @param props - Document, thread identity, and optional author.
 * @param props.document - Document receiving the message.
 * @param props.messagesId - Thread-specific message namespace.
 * @param props.threadId - Side-block identity of the thread.
 * @param props.hasMessages - Whether the form labels the message as a reply.
 * @param props.onFirstMessage - Records the first message identity.
 * @param props.author - Optional author copied onto the new message.
 * @returns A text composer that clears after a successful submission.
 */
function CommentComposer(props: CommentComposerProps) {
  const { hasMessages } = props;
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (createCommentMessage(props, text)) {
          setText("");
        }
      }}
    >
      <textarea
        aria-label={hasMessages ? "Reply to comment" : "New comment"}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={!text.trim()}>
        {hasMessages ? "Reply" : "Comment"}
      </button>
    </form>
  );
}

/**
 * Stores nonempty text in a new collaborative message field.
 *
 * @param props - Thread persistence, first-message callback, and optional author.
 * @param text - Untrimmed composer content.
 * @returns Whether a nonempty message was created.
 */
function createCommentMessage(props: CommentComposerProps, text: string): boolean {
  const content = text.trim();
  if (!content) {
    return false;
  }
  const { document, messagesId, threadId, author, hasMessages, onFirstMessage } = props;
  const message: CommentMessage = {
    id: crypto.randomUUID(),
    threadId,
    content,
    createdAt: Date.now(),
    ...(author ? { author } : {}),
  };
  document.history.batchUpdates(() => {
    document.pluginData.setField(messagesId, message.id, message);
    if (!hasMessages) {
      onFirstMessage(message.id);
    }
  });
  return true;
}

/**
 * Reads structurally valid messages for a thread from a serialized snapshot.
 *
 * @param snapshot - Serialized detached message namespace.
 * @param threadId - Side-block identity to select.
 * @returns Messages ordered by creation time and stable ID.
 */
function readMessages(snapshot: string, threadId: string): CommentMessage[] {
  const records: unknown = JSON.parse(snapshot);
  if (!records || typeof records !== "object" || Array.isArray(records)) {
    return [];
  }
  return Object.values(records)
    .flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }
      const message = value as Record<string, unknown>;
      if (
        typeof message.id !== "string" ||
        message.threadId !== threadId ||
        typeof message.content !== "string" ||
        typeof message.createdAt !== "number"
      ) {
        return [];
      }
      let author: CommentAuthor | undefined;
      if (message.author !== undefined) {
        const value = message.author;
        if (
          !value ||
          typeof value !== "object" ||
          !("id" in value) ||
          typeof value.id !== "string" ||
          !("name" in value) ||
          typeof value.name !== "string"
        ) {
          return [];
        }
        author = { id: value.id, name: value.name };
      }
      return [
        {
          id: message.id,
          threadId,
          content: message.content,
          createdAt: message.createdAt,
          ...(author ? { author } : {}),
        },
      ];
    })
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

/**
 * Reads supported thread state without trusting plugin data.
 *
 * @param block - Current detached side-block record.
 * @returns Resolution and optional root identity, defaulting to an open thread.
 */
function readThreadData(block: SideBlock): CommentThreadData {
  if (!block.data || typeof block.data !== "object") {
    return { resolved: false };
  }
  const data = block.data as Record<string, unknown>;
  return {
    resolved: data.resolved === true,
    ...(typeof data.rootMessageId === "string" ? { rootMessageId: data.rootMessageId } : {}),
  };
}
