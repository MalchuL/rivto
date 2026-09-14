/**
 * React extension and independent sidebar presentation for collaborative comments.
 *
 * The editor surface and comment sidebar are siblings so native text, block, and
 * canvas selection cannot capture comment controls. Anchors are represented only
 * by a temporary outline in the surface, while all editing stays in the sidebar.
 * Edgeless selection can start a comment from the sidebar without placing comment
 * cards inside the transformed canvas.
 *
 * @module
 */
import { findEdgelessRuntime } from "../edgeless/edgeless-runtime";
import { useEditorMode, useEditorRoot } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import type { ReactEditor } from "../../types";
import {
  Check,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Reply,
  RotateCcw,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CommentsController } from "./controller";
import type {
  CommentAnchor,
  CommentDraft,
  CommentMessage,
  CommentsExtensionOptions,
  CommentThread,
} from "./types";

const COMMENT_CLASSES = {
  action: "rivto-comment-action",
  author: "rivto-comment-author",
  boundary: "rivto-comments-boundary",
  card: "rivto-comment-card",
  composer: "rivto-comment-composer",
  content: "rivto-comments-content",
  empty: "rivto-comments-empty",
  header: "rivto-comments-header",
  iconButton: "rivto-comment-icon-button",
  anchorGroup: "rivto-comment-anchor-group",
  message: "rivto-comment-message",
  messageActions: "rivto-comment-message-actions",
  messageText: "rivto-comment-message-text",
  meta: "rivto-comment-meta",
  sidebar: "rivto-comments-sidebar",
  sidebarToggle: "rivto-comments-sidebar-toggle",
  stack: "rivto-comment-stack",
  textarea: "rivto-comment-textarea",
  time: "rivto-comment-time",
  title: "rivto-comments-title",
} as const;
const COMMENT_HIGHLIGHT_ATTRIBUTE = "data-comment-highlighted";
const COMMENT_ANCHOR_SELECTOR = "[data-block-id], [data-edgeless-object-id]";
const COMMENT_ANCHOR_GROUP_SELECTOR = "[data-comment-anchor-id]";
const PAGE_BLOCK_ROW_SELECTOR = ":scope > .page-block-row";
const COMMENT_ROW_HEIGHT_PROPERTY = "--rivto-comment-row-min-height";
const EMPTY_SELECTION = { active: false, items: [] as readonly string[] };
const COMMENT_ICON_SIZE = 16;
const COMMENT_BLOCK_GAP = 12;

/** Subscribes a component to controller-backed local and persisted state. */
function useComments(controller: CommentsController): void {
  useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getRevision(),
    () => controller.getRevision(),
  );
}

/** Formats one persisted timestamp without adding a date dependency. */
function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

/** Returns whether a rendered host represents a persisted comment anchor. */
function hostMatchesAnchor(host: HTMLElement, anchor: CommentAnchor): boolean {
  return anchor.type === "block"
    ? host.dataset.blockId === anchor.id
    : host.dataset.edgelessObjectId === anchor.id;
}

/** Renders one accessible icon-only comment action. */
function IconButton({ label, icon: Icon, className = "", type = "button", ...button }: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
  readonly icon: LucideIcon;
}) {
  return (
    <button
      {...button}
      type={type}
      className={`${COMMENT_CLASSES.iconButton} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <Icon size={COMMENT_ICON_SIZE} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

/** Renders optional author and timestamp metadata for one message. */
function MessageMeta({ message }: { readonly message: CommentMessage }) {
  return (
    <div className={COMMENT_CLASSES.meta}>
      {message.author && <span className={COMMENT_CLASSES.author}>{message.author.name}</span>}
      <time className={COMMENT_CLASSES.time} dateTime={new Date(message.createdAt).toISOString()}>
        {formatTime(message.updatedAt ?? message.createdAt)}{message.updatedAt ? " (edited)" : ""}
      </time>
    </div>
  );
}

/** Renders one message with click-to-edit text and icon-only edit/delete controls. */
function MessageView({ controller, thread, message }: {
  readonly controller: CommentsController;
  readonly thread: CommentThread;
  readonly message: CommentMessage;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(message.content);
  /** Saves a changed non-empty message and exits inline editing. */
  const save = (): void => {
    const normalized = content.trim();
    if (normalized && normalized !== message.content) controller.editMessage(thread.id, message.id, normalized);
    else setContent(message.content);
    setEditing(false);
  };
  /** Applies compact keyboard conventions to the inline textarea. */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      setContent(message.content);
      setEditing(false);
    } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.currentTarget.blur();
    }
  };
  return (
    <div className={COMMENT_CLASSES.message} data-comment-message-id={message.id}>
      <MessageMeta message={message} />
      {editing ? (
        <textarea
          autoFocus
          className={COMMENT_CLASSES.textarea}
          aria-label="Edit comment"
          rows={2}
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          type="button"
          className={COMMENT_CLASSES.messageText}
          disabled={thread.resolved}
          onClick={() => setEditing(true)}
        >{message.content}</button>
      )}
      {!thread.resolved && <div className={COMMENT_CLASSES.messageActions}>
        <IconButton label="Edit comment" icon={Pencil} onClick={() => setEditing(true)} />
        <IconButton
          label="Delete comment"
          icon={Trash2}
          onClick={() => controller.deleteMessage(thread.id, message.id)}
        />
      </div>}
    </div>
  );
}

/** Renders and submits a reply composer after the user explicitly opens it. */
function ReplyComposer({ controller, threadId, onClose }: {
  readonly controller: CommentsController;
  readonly threadId: string;
  readonly onClose: () => void;
}) {
  const [content, setContent] = useState("");
  /** Persists the reply and minimizes the composer again. */
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!content.trim()) return;
    controller.addReply(threadId, content);
    onClose();
  };
  return (
    <form className={COMMENT_CLASSES.composer} onSubmit={submit}>
      <textarea
        autoFocus
        className={COMMENT_CLASSES.textarea}
        aria-label="Reply to comment"
        placeholder="Reply…"
        rows={2}
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className={COMMENT_CLASSES.messageActions}>
        <IconButton type="submit" label="Send reply" icon={Send} disabled={!content.trim()} />
        <IconButton label="Cancel reply" icon={X} onClick={onClose} />
      </div>
    </form>
  );
}

/** Renders one thread with minimized reply UI and icon-only actions. */
function ThreadCard({ controller, thread }: {
  readonly controller: CommentsController;
  readonly thread: CommentThread;
}) {
  const [replying, setReplying] = useState(false);
  const rootMessage = thread.messages[0]!;
  if (thread.resolved) {
    return (
      <article className={COMMENT_CLASSES.card} data-comment-thread-id={thread.id} data-comment-resolved="true">
        <div className={COMMENT_CLASSES.messageText}>{rootMessage.content}</div>
        <div className={COMMENT_CLASSES.messageActions}>
          <IconButton label="Reopen comment" icon={RotateCcw} onClick={() => controller.setResolved(thread.id, false)} />
          <IconButton label="Delete comment" icon={Trash2} onClick={() => controller.deleteThread(thread.id)} />
        </div>
      </article>
    );
  }
  return (
    <article
      className={COMMENT_CLASSES.card}
      data-comment-thread-id={thread.id}
      onFocus={() => controller.highlightThread(thread.id)}
      onMouseEnter={() => controller.highlightThread(thread.id)}
      onMouseLeave={() => controller.highlightThread(null)}
    >
      {thread.messages.map((message) => (
        <MessageView key={message.id} controller={controller} thread={thread} message={message} />
      ))}
      {replying && <ReplyComposer controller={controller} threadId={thread.id} onClose={() => setReplying(false)} />}
      <div className={COMMENT_CLASSES.messageActions}>
        {!replying && <IconButton label="Reply" icon={Reply} onClick={() => setReplying(true)} />}
        <IconButton label="Resolve" icon={Check} onClick={() => controller.setResolved(thread.id)} />
      </div>
    </article>
  );
}

/** Renders the one local new-thread composer and persists only on submission. */
function DraftComposer({ controller, draft }: {
  readonly controller: CommentsController;
  readonly draft: CommentDraft;
}) {
  const [content, setContent] = useState("");
  /** Submits a non-empty draft through the controller. */
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (content.trim()) controller.submitDraft(content);
  };
  return (
    <form className={COMMENT_CLASSES.card} data-comment-draft="true" onSubmit={submit}>
      <textarea
        autoFocus
        className={COMMENT_CLASSES.textarea}
        aria-label="New comment"
        placeholder="Write a comment…"
        rows={3}
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") controller.cancelDraft();
          else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className={COMMENT_CLASSES.messageActions}>
        <IconButton type="submit" label="Comment" icon={Send} disabled={!content.trim()} />
        <IconButton label="Cancel comment" icon={X} onClick={() => controller.cancelDraft()} />
      </div>
      <span hidden>{draft.anchors.map((anchor) => `${anchor.type}:${anchor.id}`).join(",")}</span>
    </form>
  );
}

/** Renders block comments at their anchor's vertical position in the sibling sidebar. */
function BlockCommentStack({ controller, threads, draft, root }: {
  readonly controller: CommentsController;
  readonly threads: readonly CommentThread[];
  readonly draft: CommentDraft | null;
  readonly root: HTMLElement | null;
}) {
  const [stack, setStack] = useState<HTMLDivElement | null>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const groups = new Map<string, { threads: CommentThread[]; draft: CommentDraft | null }>();
  threads.forEach((thread) => {
    const anchor = thread.anchors.find((candidate) => candidate.type === "block");
    if (!anchor) return;
    const group = groups.get(anchor.id) ?? { threads: [], draft: null };
    group.threads.push(thread);
    groups.set(anchor.id, group);
  });
  const draftAnchor = draft?.anchors.find((anchor) => anchor.type === "block");
  if (draft && draftAnchor) {
    const group = groups.get(draftAnchor.id) ?? { threads: [], draft: null };
    group.draft = draft;
    groups.set(draftAnchor.id, group);
  }
  const anchorIds = [...groups.keys()].join("\n");

  useLayoutEffect(() => {
    if (!root || !stack) return;
    if (!groups.size) {
      stack.style.minHeight = "";
      return;
    }
    const hosts = [...root.querySelectorAll<HTMLElement>("[data-block-id]")];
    const groupElements = [...stack.querySelectorAll<HTMLElement>(COMMENT_ANCHOR_GROUP_SELECTOR)];
    const spacedRows = [...groups.keys()].flatMap((id) => {
      const host = hosts.find((candidate) => candidate.dataset.blockId === id);
      const row = host?.querySelector<HTMLElement>(PAGE_BLOCK_ROW_SELECTOR);
      return row ? [row] : [];
    });
    /** Aligns each group to its block, pushing only collisions below earlier cards. */
    const measure = (): void => {
      const stackTop = stack.getBoundingClientRect().top;
      let bottom = 0;
      const next: Record<string, number> = {};
      [...groups.keys()]
        .flatMap((id) => {
          const host = hosts.find((candidate) => candidate.dataset.blockId === id);
          const group = groupElements.find((candidate) => candidate.dataset.commentAnchorId === id);
          return host && group ? [{ id, group, anchorTop: host.getBoundingClientRect().top - stackTop }] : [];
        })
        .sort((left, right) => left.anchorTop - right.anchorTop)
        .forEach(({ id, group, anchorTop }) => {
          const top = Math.max(anchorTop, bottom);
          next[id] = top;
          const groupHeight = group.getBoundingClientRect().height;
          const host = hosts.find((candidate) => candidate.dataset.blockId === id);
          host?.querySelector<HTMLElement>(PAGE_BLOCK_ROW_SELECTOR)
            ?.style.setProperty(COMMENT_ROW_HEIGHT_PROPERTY, `${groupHeight + COMMENT_BLOCK_GAP}px`);
          bottom = top + groupHeight + COMMENT_BLOCK_GAP;
        });
      // Absolute alignment must still reserve its bottom edge so a following
      // editor cannot paint over an expanded comment group.
      stack.style.minHeight = `${Math.max(root.getBoundingClientRect().bottom - stackTop, bottom)}px`;
      setOffsets((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    groupElements.forEach((group) => observer.observe(group));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      spacedRows.forEach((row) => row.style.removeProperty(COMMENT_ROW_HEIGHT_PROPERTY));
    };
  }, [anchorIds, root, stack]);

  return (
    <div ref={setStack} className={COMMENT_CLASSES.stack} data-comment-stack="true">
      {[...groups].map(([anchorId, group]) => (
        <div
          key={anchorId}
          className={COMMENT_CLASSES.anchorGroup}
          data-comment-anchor-id={anchorId}
          style={{ top: offsets[anchorId] ?? 0 }}
        >
          {group.threads.map((thread) => <ThreadCard key={thread.id} controller={controller} thread={thread} />)}
          {group.draft && <DraftComposer controller={controller} draft={group.draft} />}
        </div>
      ))}
      {!groups.size && <p className={COMMENT_CLASSES.empty}>No comments yet.</p>}
    </div>
  );
}

/** Creates the editor-wide sidebar wrapper bound to one comments controller. */
function createCommentsBoundary(controller: CommentsController) {
  /** Keeps comment interaction in a sibling panel outside the selectable surface. */
  function CommentsBoundary({ children }: { readonly children?: ReactNode }) {
    const [open, setOpen] = useState(true);
    useComments(controller);
    const { mode } = useEditorMode();
    const { element: root } = useEditorRoot();
    const runtime = findEdgelessRuntime(controller.reactEditor);
    const selection = useSyncExternalStore(
      (listener) => runtime?.subscribe(listener) ?? (() => undefined),
      () => runtime?.snapshot() ?? EMPTY_SELECTION,
      () => EMPTY_SELECTION,
    );
    const threads = controller.getThreads();
    const draft = controller.getDraft();
    const highlightedThread = threads.find((thread) => thread.id === controller.getHighlightedThreadId());
    const selectedElements = mode === "edgeless" && selection.active
      ? selection.items.filter((id) => controller.reactEditor.editor.elements.getElement(id))
      : [];

    useEffect(() => {
      if (draft) setOpen(true);
    }, [draft]);
    useEffect(() => {
      if (!root) return;
      const hosts = [...root.querySelectorAll<HTMLElement>(COMMENT_ANCHOR_SELECTOR)];
      hosts.forEach((host) => host.removeAttribute(COMMENT_HIGHLIGHT_ATTRIBUTE));
      highlightedThread?.anchors.forEach((anchor) => {
        hosts.find((host) => hostMatchesAnchor(host, anchor))?.setAttribute(COMMENT_HIGHLIGHT_ATTRIBUTE, "true");
      });
      return () => hosts.forEach((host) => host.removeAttribute(COMMENT_HIGHLIGHT_ATTRIBUTE));
    }, [highlightedThread, root]);

    return (
      <div className={COMMENT_CLASSES.boundary} data-comments-open={open ? "true" : "false"} data-comments-mode={mode}>
        <div className={COMMENT_CLASSES.content}>{children}</div>
        {open ? (
          <aside className={COMMENT_CLASSES.sidebar} data-comment-sidebar="true" data-edgeless-ui="true" aria-label="Comments">
            <header className={COMMENT_CLASSES.header}>
              <span className={COMMENT_CLASSES.title}>Comments</span>
              <div className={COMMENT_CLASSES.messageActions}>
                {selectedElements.length > 0 && <IconButton
                  label="Comment on selection"
                  icon={MessageSquare}
                  className={COMMENT_CLASSES.action}
                  onClick={() => controller.startDraft(selectedElements.map((id) => ({ type: "element", id })))}
                />}
                <IconButton label="Hide comments" icon={PanelRightClose} onClick={() => setOpen(false)} />
              </div>
            </header>
            {mode === "block" ? (
              <BlockCommentStack controller={controller} threads={threads} draft={draft} root={root} />
            ) : (
              <div className={COMMENT_CLASSES.stack} data-comment-stack="true">
                {threads.map((thread) => <ThreadCard key={thread.id} controller={controller} thread={thread} />)}
                {draft && <DraftComposer controller={controller} draft={draft} />}
                {!threads.length && !draft && <p className={COMMENT_CLASSES.empty}>No comments yet.</p>}
              </div>
            )}
          </aside>
        ) : (
          <IconButton
            label="Show comments"
            icon={PanelRightOpen}
            className={COMMENT_CLASSES.sidebarToggle}
            data-edgeless-ui="true"
            onClick={() => setOpen(true)}
          />
        )}
      </div>
    );
  }
  return CommentsBoundary;
}

/** Installable comments extension with a typed imperative host API. */
export class CommentsExtension implements ReactEditorExtension {
  readonly id = "comments";
  private controller?: CommentsController;

  /** @param options - Optional author applied to new messages. */
  constructor(private readonly options: CommentsExtensionOptions = {}) {}

  /** @param reactEditor - Complete runtime receiving comments behavior. @returns Cleanup callback. */
  setup(reactEditor: ReactEditor): () => void {
    if (this.controller) throw new Error("Comments extension is already installed");
    const controller = new CommentsController(reactEditor, this.options);
    this.controller = controller;
    reactEditor.surfaces.registerEditorWrapper(createCommentsBoundary(controller));
    reactEditor.slashCommands.register({
      id: "comment.create",
      title: "Comment",
      group: "Actions",
      keywords: ["discussion", "note", "reply"],
      isAvailable: ({ blockId }) => Boolean(reactEditor.editor.blocks.getBlock(blockId)),
      execute: ({ blockId }) => controller.startDraft([{ type: "block", id: blockId }]),
    });
    return () => {
      if (this.controller === controller) this.controller = undefined;
      controller.destroy();
    };
  }

  /** @returns Current detached thread list. */
  getThreads(): CommentThread[] { return this.api.getThreads(); }
  /** @param listener - Change callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void { return this.api.subscribe(listener); }
  /** @param anchors - Existing objects. @param content - Root message. @returns Thread ID. */
  createThread(anchors: readonly CommentAnchor[], content: string): string { return this.api.createThread(anchors, content); }
  /** @param threadId - Existing thread. @param content - Reply body. @returns Message ID. */
  addReply(threadId: string, content: string): string { return this.api.addReply(threadId, content); }
  /** @param threadId - Existing thread. @param messageId - Existing message. @param content - Replacement body. */
  editMessage(threadId: string, messageId: string, content: string): void { this.api.editMessage(threadId, messageId, content); }
  /** @param threadId - Existing thread. @param messageId - Existing message. */
  deleteMessage(threadId: string, messageId: string): void { this.api.deleteMessage(threadId, messageId); }
  /** @param threadId - Existing thread. @param resolved - True to resolve, false to reopen. */
  setResolved(threadId: string, resolved = true): void { this.api.setResolved(threadId, resolved); }
  /** @param threadId - Existing thread to remove. */
  deleteThread(threadId: string): void { this.api.deleteThread(threadId); }
  /** @param threadId - Existing thread, or null to clear. */
  highlightThread(threadId: string | null): void { this.api.highlightThread(threadId); }

  /** @returns Installed controller or throws before setup/after teardown. */
  private get api(): CommentsController {
    if (!this.controller) throw new Error("Comments extension is not installed");
    return this.controller;
  }
}

/** @param options - Optional author configuration. @returns Installable comments extension. */
export function commentsExtension(options: CommentsExtensionOptions = {}): CommentsExtension {
  return new CommentsExtension(options);
}
