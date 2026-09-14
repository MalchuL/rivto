/**
 * Collaborative storage and local interaction state for comments.
 *
 * Each thread is an independent document plugin-map entry, so unrelated
 * discussions merge between clients and never enter block clipboard payloads.
 * The controller also owns the one pending composer and highlighted thread.
 *
 * @module
 */
import type { BasicCRDTType, CRDTMap } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import type {
  CommentAnchor,
  CommentAuthor,
  CommentDraft,
  CommentMessage,
  CommentsExtensionOptions,
  CommentThread,
} from "./types";

/** Stable document plugin namespace for comment thread records. */
export const COMMENTS_PLUGIN_ID = "rivto.comments";

type CommentRecords = CRDTMap<Record<string, BasicCRDTType>>;

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Creates a browser-native stable identifier with a compatibility fallback. */
function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Validates and detaches optional author data at the extension boundary. */
function normalizeAuthor(author: CommentAuthor | null | undefined): CommentAuthor | undefined {
  if (author == null) return undefined;
  const id = author.id.trim();
  const name = author.name.trim();
  if (!id || !name) throw new Error("Comment author requires a non-empty id and name");
  return { id, name };
}

/** Parses one portable anchor without trusting persisted plugin data. */
function parseAnchor(value: unknown): CommentAnchor | undefined {
  if (!isRecord(value) || (value.type !== "block" && value.type !== "element") || typeof value.id !== "string") {
    return undefined;
  }
  const id = value.id.trim();
  return id ? { type: value.type, id } : undefined;
}

/** Parses one portable message without exposing malformed records to callers. */
function parseMessage(value: unknown): CommentMessage | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.content !== "string" ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return undefined;
  const authorValue = value.author;
  const author = isRecord(authorValue) && typeof authorValue.id === "string" && typeof authorValue.name === "string"
    ? normalizeAuthor({ id: authorValue.id, name: authorValue.name })
    : undefined;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
    ? value.updatedAt
    : undefined;
  return {
    id: value.id,
    content: value.content,
    ...(author ? { author } : {}),
    createdAt: value.createdAt,
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

/** Parses one complete thread and ignores invalid plugin records. */
function parseThread(value: unknown): CommentThread | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.anchors) ||
    !Array.isArray(value.messages) || typeof value.resolved !== "boolean" ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return undefined;
  const anchors = value.anchors.flatMap((anchor) => parseAnchor(anchor) ?? []);
  const messages = value.messages.flatMap((message) => parseMessage(message) ?? []);
  if (!anchors.length || !messages.length) return undefined;
  return { id: value.id, anchors, messages, resolved: value.resolved, createdAt: value.createdAt };
}

/** Owns persisted comment operations and ephemeral composer/highlight state. */
export class CommentsController {
  private readonly listeners = new Set<() => void>();
  private readonly author?: CommentAuthor;
  private readonly unsubscribeDocument: () => void;
  private draft: CommentDraft | null = null;
  private highlightedThreadId: string | null = null;
  private revision = 0;
  private reconciling = false;

  /**
   * Creates a controller bound to one React editor runtime.
   *
   * @param reactEditor - Runtime whose document stores comment threads.
   * @param options - Optional author copied onto newly created messages.
   */
  constructor(readonly reactEditor: ReactEditor, options: CommentsExtensionOptions = {}) {
    this.author = normalizeAuthor(options.author);
    this.unsubscribeDocument = reactEditor.editor.document.subscribe(() => {
      this.reconcileAnchors();
      this.changed();
    });
  }

  /** @returns Current monotonic snapshot token for React subscriptions. */
  getRevision(): number {
    return this.revision;
  }

  /** @param listener - State-change callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @returns Valid detached threads ordered by creation time. */
  getThreads(): CommentThread[] {
    const records = this.reactEditor.editor.document.pluginData.get<Record<string, unknown>>(COMMENTS_PLUGIN_ID) ?? {};
    return Object.values(records)
      .flatMap((record) => parseThread(record) ?? [])
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  /** @returns Current unpersisted composer target, or null. */
  getDraft(): CommentDraft | null {
    return this.draft ? { anchors: this.draft.anchors.map((anchor) => ({ ...anchor })) } : null;
  }

  /** @returns Currently highlighted thread ID, or null. */
  getHighlightedThreadId(): string | null {
    return this.highlightedThreadId;
  }

  /** @param anchors - Objects that will own the submitted thread. @returns No value. */
  startDraft(anchors: readonly CommentAnchor[]): void {
    this.draft = { anchors: this.requireAnchors(anchors) };
    this.highlightedThreadId = null;
    this.changed();
  }

  /** Cancels the pending composer without mutating the document. */
  cancelDraft(): void {
    if (!this.draft) return;
    this.draft = null;
    this.changed();
  }

  /** @param content - Non-empty root message. @returns Stable new thread ID. */
  submitDraft(content: string): string {
    if (!this.draft) throw new Error("No pending comment draft");
    const id = this.createThread(this.draft.anchors, content);
    this.draft = null;
    this.changed();
    return id;
  }

  /**
   * Creates a thread directly for host integrations.
   *
   * @param anchors - Existing block or element anchors.
   * @param content - Non-empty root message.
   * @returns Stable new thread ID.
   */
  createThread(anchors: readonly CommentAnchor[], content: string): string {
    const createdAt = Date.now();
    const id = createId();
    const thread: CommentThread = {
      id,
      anchors: this.requireAnchors(anchors),
      messages: [this.message(this.requireContent(content), createdAt)],
      resolved: false,
      createdAt,
    };
    this.write((records) => records.set(id, thread as unknown as BasicCRDTType));
    this.highlightedThreadId = id;
    this.changed();
    return id;
  }

  /** @param threadId - Existing thread. @param content - Reply text. @returns New message ID. */
  addReply(threadId: string, content: string): string {
    const thread = this.requireThread(threadId);
    if (thread.resolved) throw new Error("Resolved comments cannot receive replies");
    const reply = this.message(this.requireContent(content), Date.now());
    this.replaceThread({ ...thread, messages: [...thread.messages, reply] });
    return reply.id;
  }

  /** @param threadId - Existing thread. @param messageId - Message to edit. @param content - Replacement text. */
  editMessage(threadId: string, messageId: string, content: string): void {
    const thread = this.requireThread(threadId);
    if (thread.resolved) throw new Error("Resolved comments cannot be edited");
    let found = false;
    const messages = thread.messages.map((message) => {
      if (message.id !== messageId) return message;
      found = true;
      return { ...message, content: this.requireContent(content), updatedAt: Date.now() };
    });
    if (!found) throw new Error(`Comment message ${messageId} not found`);
    this.replaceThread({ ...thread, messages });
  }

  /** @param threadId - Existing thread. @param messageId - Reply or root to delete. */
  deleteMessage(threadId: string, messageId: string): void {
    const thread = this.requireThread(threadId);
    const index = thread.messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new Error(`Comment message ${messageId} not found`);
    if (index === 0) {
      this.deleteThread(threadId);
      return;
    }
    this.replaceThread({ ...thread, messages: thread.messages.filter((message) => message.id !== messageId) });
  }

  /** @param threadId - Existing thread. @param resolved - True to resolve, false to reopen. */
  setResolved(threadId: string, resolved = true): void {
    const thread = this.requireThread(threadId);
    if (thread.resolved === resolved) return;
    this.replaceThread({ ...thread, resolved });
  }

  /** @param threadId - Existing thread to remove permanently. */
  deleteThread(threadId: string): void {
    this.requireThread(threadId);
    this.write((records) => records.delete(threadId));
    if (this.highlightedThreadId === threadId) this.highlightedThreadId = null;
    this.changed();
  }

  /** @param threadId - Existing thread ID, or null to clear highlighting. */
  highlightThread(threadId: string | null): void {
    if (threadId !== null) this.requireThread(threadId);
    if (this.highlightedThreadId === threadId) return;
    this.highlightedThreadId = threadId;
    this.changed();
  }

  /** Releases document and UI subscriptions owned by this controller. */
  destroy(): void {
    this.unsubscribeDocument();
    this.listeners.clear();
    this.draft = null;
    this.highlightedThreadId = null;
  }

  /** Creates one message using the extension's current author snapshot. */
  private message(content: string, createdAt: number): CommentMessage {
    return { id: createId(), content, ...(this.author ? { author: { ...this.author } } : {}), createdAt };
  }

  /** Resolves and validates one thread by ID. */
  private requireThread(threadId: string): CommentThread {
    const thread = this.getThreads().find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error(`Comment thread ${threadId} not found`);
    return thread;
  }

  /** Validates, trims, deduplicates, and resolves anchors. */
  private requireAnchors(anchors: readonly CommentAnchor[]): CommentAnchor[] {
    const seen = new Set<string>();
    const normalized = anchors.flatMap((anchor) => {
      const parsed = parseAnchor(anchor);
      if (!parsed) throw new Error("Comments require block or element anchors");
      const key = `${parsed.type}:${parsed.id}`;
      if (seen.has(key)) return [];
      const exists = parsed.type === "block"
        ? Boolean(this.reactEditor.editor.blocks.getBlock(parsed.id))
        : Boolean(this.reactEditor.editor.elements.getElement(parsed.id));
      if (!exists) throw new Error(`Comment ${parsed.type} anchor ${parsed.id} not found`);
      seen.add(key);
      return [parsed];
    });
    if (!normalized.length) throw new Error("Comments require at least one anchor");
    return normalized;
  }

  /** Validates a non-empty plain-text message. */
  private requireContent(content: string): string {
    const normalized = content.trim();
    if (!normalized) throw new Error("Comment content is required");
    return normalized;
  }

  /** Replaces one independent thread record. */
  private replaceThread(thread: CommentThread): void {
    this.write((records) => records.set(thread.id, thread as unknown as BasicCRDTType));
    this.changed();
  }

  /** Runs one comment-map mutation in the editor's transaction boundary. */
  private write(operation: (records: CommentRecords) => void): void {
    this.reactEditor.editor.batchUpdates(() => {
      operation(this.reactEditor.editor.document.pluginData.getMap(COMMENTS_PLUGIN_ID));
    });
  }

  /** Removes anchors that no longer exist and drops fully orphaned threads. */
  private reconcileAnchors(): void {
    if (this.reconciling) return;
    const repairs = this.getThreads().flatMap((thread) => {
      const anchors = thread.anchors.filter((anchor) => anchor.type === "block"
        ? Boolean(this.reactEditor.editor.blocks.getBlock(anchor.id))
        : Boolean(this.reactEditor.editor.elements.getElement(anchor.id)));
      return anchors.length === thread.anchors.length ? [] : [{ thread, anchors }];
    });
    const draftAnchors = this.draft?.anchors.filter((anchor) => anchor.type === "block"
      ? Boolean(this.reactEditor.editor.blocks.getBlock(anchor.id))
      : Boolean(this.reactEditor.editor.elements.getElement(anchor.id))) ?? [];
    if (!repairs.length && (!this.draft || draftAnchors.length === this.draft.anchors.length)) return;
    this.reconciling = true;
    try {
      if (repairs.length) this.write((records) => repairs.forEach(({ thread, anchors }) => {
        if (anchors.length) records.set(thread.id, { ...thread, anchors } as unknown as BasicCRDTType);
        else records.delete(thread.id);
      }));
      if (this.draft) this.draft = draftAnchors.length ? { anchors: draftAnchors } : null;
    } finally {
      this.reconciling = false;
    }
  }

  /** Advances the local revision and notifies subscribers. */
  private changed(): void {
    this.revision += 1;
    [...this.listeners].forEach((listener) => listener());
  }
}
