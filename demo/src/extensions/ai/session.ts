/**
 * Per-editor agent session: chat transcript, tool runs, and ghost text.
 *
 * The session is framework-free. React subscribes to {@link AiSession.getSnapshot}.
 *
 * @module
 */

import type { ReactEditor } from "@chulane/rivto-react";
import { runAgentTurn, type AgentEvent } from "./agent.ts";
import type { AiDocumentPort } from "./editor-tools.ts";
import { EDITOR_TOOLS } from "./editor-tools.ts";
import type { ChatMessage, LlmClient } from "./llm.ts";

/** One row in the agent panel. */
export type TranscriptEntry =
  | { readonly id: string; readonly kind: "user" | "reasoning" | "assistant" | "error"; readonly text: string }
  | { readonly id: string; readonly kind: "tool"; readonly name: string; readonly text: string };

/** Ghost text waiting for Tab. `prefix` is the text the suggestion was built from. */
export interface AiSuggestion {
  readonly blockId: string;
  readonly text: string;
  readonly prefix: string;
}

/** Immutable view rendered by the panel and the ghost overlay. */
export interface AiSnapshot {
  readonly revision: number;
  readonly open: boolean;
  readonly running: boolean;
  readonly draft: string;
  readonly entries: readonly TranscriptEntry[];
  readonly suggestion: AiSuggestion | null;
  readonly caretBlockId?: string;
}

/** Caret reading the bridge supplies after each keystroke. */
export interface CompletionSource {
  readonly blockId: string;
  readonly prefix: string;
  readonly suffix: string;
}

const IDLE: AiSnapshot = {
  revision: 0,
  open: false,
  running: false,
  draft: "",
  entries: [],
  suggestion: null,
};

/**
 * Owns one editor's mock agent and inline completion.
 */
export class AiSession {
  private snapshot: AiSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private history: ChatMessage[] = [];
  private turn: AbortController | null = null;
  private completion: AbortController | null = null;
  private completionTimer: ReturnType<typeof setTimeout> | null = null;
  private completionGeneration = 0;
  /** Resolves with the full ghost suffix, including tokens still in flight. */
  private pendingCompletion: Promise<string> | null = null;
  private composing = false;
  private suppressCompletion = false;

  /**
   * @param reactEditor - Editor whose history brackets a streamed turn.
   * @param client - Model client. The demo passes the mock.
   * @param port - Document mutations for tool calls.
   * @param insertSuggestion - Applies accepted ghost text at the caret.
   */
  constructor(
    private readonly reactEditor: ReactEditor,
    private readonly client: LlmClient,
    private readonly port: AiDocumentPort,
    private readonly insertSuggestion: (blockId: string, text: string) => void,
  ) {}

  /** @param listener - Called after every snapshot change. @returns Unsubscriber. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** @returns The current snapshot. The reference changes when state changes. */
  getSnapshot = (): AiSnapshot => this.snapshot;

  /** @param open - Whether the panel is visible. */
  setOpen(open: boolean): void {
    this.publish({ open });
  }

  /** @param draft - Composer text. */
  setDraft(draft: string): void {
    this.publish({ draft });
  }

  /** Sends the composer text. */
  send(): void {
    const text = this.snapshot.draft.trim();
    if (!text) return;
    this.publish({ draft: "" });
    const focus = this.snapshot.caretBlockId;
    void this.run(focus ? `${text}\n[block ${focus}]` : text, focus, text);
  }

  /**
   * Rewrites one block. Used by the row button.
   *
   * @param blockId - Block the button belongs to.
   */
  rewriteBlock(blockId: string): void {
    void this.run(`[block ${blockId}] Rewrite this block.`, blockId, "Rewrite this block.");
  }

  /** Inserts a paragraph after the caret block, or at the end. */
  addParagraph(): void {
    const focus = this.snapshot.caretBlockId;
    void this.run(
      focus ? `[block ${focus}] Add a new paragraph.` : "Add a new paragraph.",
      focus,
      "Add a new paragraph.",
    );
  }

  /** Duplicates the caret block or the last block the user pointed at. */
  duplicateFocused(): void {
    const focus = this.snapshot.caretBlockId;
    if (!focus) {
      this.publish({
        open: true,
        entries: [...this.snapshot.entries, {
          id: crypto.randomUUID(),
          kind: "error",
          text: "Place the caret in a block, or use that block's AI button, before duplicating.",
        }],
      });
      return;
    }
    void this.run(`[block ${focus}] Duplicate this block.`, focus, "Duplicate this block.");
  }

  /** Aborts the current model stream. */
  stop(): void {
    this.turn?.abort();
    this.turn = null;
    this.publish({ running: false });
  }

  /** @param blockId - Block that owns the keyboard event. @returns Whether Tab should accept. */
  canAccept(blockId: string | undefined): boolean {
    const suggestion = this.snapshot.suggestion;
    return Boolean(suggestion?.text && suggestion.blockId === blockId);
  }

  /** @returns Whether ghost text is visible. */
  hasSuggestion(): boolean {
    return Boolean(this.snapshot.suggestion?.text);
  }

  /** Drops ghost text without inserting it. @returns True when a suggestion was visible. */
  clearSuggestion(): boolean {
    this.completionGeneration += 1;
    this.completion?.abort();
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.completionTimer = null;
    if (!this.snapshot.suggestion) return false;
    this.publish({ suggestion: null });
    return true;
  }

  /**
   * Inserts the ghost text at the caret.
   *
   * Tab claims the key immediately. If words are still streaming, the insert
   * waits for the rest of the suffix so the block receives the full phrase.
   *
   * @returns True when a suggestion was accepted.
   */
  acceptSuggestion(): boolean {
    const suggestion = this.snapshot.suggestion;
    if (!suggestion?.text) return false;
    const pending = this.pendingCompletion;
    const blockId = suggestion.blockId;
    const fallback = suggestion.text;
    this.suppressCompletion = true;
    this.publish({ suggestion: null });
    void (async () => {
      const streamed = pending ? await pending : fallback;
      const text = streamed.length >= fallback.length ? streamed : fallback;
      this.insertSuggestion(blockId, text);
      setTimeout(() => {
        this.suppressCompletion = false;
      }, 60);
    })();
    return true;
  }

  /**
   * Remembers composition so a partial IME word does not request a suggestion.
   *
   * @param composing - True between compositionstart and compositionend.
   */
  setComposing(composing: boolean): void {
    this.composing = composing;
    if (composing) this.clearSuggestion();
  }

  /**
   * Schedules ghost text for the current caret.
   *
   * Slash queries are left to the slash menu. Empty text does not complete.
   *
   * @param source - Caret text, or null when the caret left a block.
   */
  scheduleCompletion(source: CompletionSource | null): void {
    if (this.composing || this.snapshot.running || this.suppressCompletion) return;
    if (!source || !source.prefix.trim() || /(?:^|\s)\/[^\s]*$/.test(source.prefix)) {
      this.clearSuggestion();
      if (source) this.publish({ caretBlockId: source.blockId });
      return;
    }
    this.completionGeneration += 1;
    this.completion?.abort();
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.publish({ caretBlockId: source.blockId, suggestion: null });
    this.completionTimer = setTimeout(() => {
      this.completionTimer = null;
      void this.requestCompletion(source);
    }, 180);
  }

  /** Drops timers and aborts in-flight streams. */
  dispose(): void {
    this.turn?.abort();
    this.completion?.abort();
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.listeners.clear();
  }

  private requestCompletion(source: CompletionSource): void {
    const generation = ++this.completionGeneration;
    const abort = new AbortController();
    this.completion = abort;
    const pending = this.readCompletion(source, generation, abort);
    this.pendingCompletion = pending;
    void pending;
  }

  /**
   * Streams one ghost suffix. Later keystrokes invalidate `generation`.
   *
   * @param source - Caret the suggestion belongs to.
   * @param generation - Request id. A newer request abandons this one.
   * @param abort - Cancel handle for Escape and disposal.
   * @returns The suffix received before the stream ended or was abandoned.
   */
  private async readCompletion(
    source: CompletionSource,
    generation: number,
    abort: AbortController,
  ): Promise<string> {
    let text = "";
    try {
      for await (const event of this.client.complete({
        prefix: source.prefix,
        suffix: source.suffix,
      }, abort.signal)) {
        if (generation !== this.completionGeneration || abort.signal.aborted) return text;
        text += event.delta;
        if (!this.suppressCompletion) {
          this.publish({
            suggestion: { blockId: source.blockId, text, prefix: source.prefix },
          });
        }
      }
    } catch {
      if (generation === this.completionGeneration && !abort.signal.aborted) {
        this.publish({ suggestion: null });
      }
    }
    return text;
  }

  private async run(text: string, focusBlockId?: string, display = text): Promise<void> {
    if (this.snapshot.running) this.turn?.abort();
    const abort = new AbortController();
    this.turn = abort;
    this.clearSuggestion();
    const user: ChatMessage = { role: "user", content: text };
    this.history = [...this.history, user].slice(-12);
    this.publish({
      open: true,
      running: true,
      caretBlockId: focusBlockId ?? this.snapshot.caretBlockId,
      entries: [...this.snapshot.entries, { id: crypto.randomUUID(), kind: "user", text: display }],
    });
    this.reactEditor.history.stopCapturing();
    try {
      const added = await runAgentTurn({
        client: this.client,
        port: this.port,
        tools: EDITOR_TOOLS,
        messages: this.history,
        focusBlockId,
        signal: abort.signal,
        onEvent: (event) => this.applyAgentEvent(event),
      });
      this.history = [...this.history, ...added].slice(-12);
    } finally {
      try {
        this.reactEditor.history.stopCapturing();
      } catch {
        // The editor can already be destroyed while a stream settles.
      }
      if (this.turn === abort) {
        this.turn = null;
        this.publish({ running: false });
      }
    }
  }

  private applyAgentEvent(event: AgentEvent): void {
    const entries = [...this.snapshot.entries];
    const last = entries.at(-1);
    if (event.type === "error") {
      entries.push({ id: crypto.randomUUID(), kind: "error", text: event.text });
      this.publish({ entries });
      return;
    }
    if (event.type === "tool") {
      if (last?.kind === "tool" && last.name === event.name) {
        entries[entries.length - 1] = { ...last, text: event.detail };
      } else {
        entries.push({ id: crypto.randomUUID(), kind: "tool", name: event.name, text: event.detail });
      }
      this.publish({ entries });
      return;
    }
    const kind = event.type === "reasoning" ? "reasoning" : "assistant";
    if (last?.kind === kind) entries[entries.length - 1] = { ...last, text: event.text };
    else entries.push({ id: crypto.randomUUID(), kind, text: event.text });
    this.publish({ entries });
  }

  private publish(patch: Partial<AiSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 };
    for (const listener of this.listeners) listener();
  }
}
