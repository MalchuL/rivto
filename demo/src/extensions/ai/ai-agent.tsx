/**
 * Demo AI extension: agent panel, per-block edit button, and ghost text.
 *
 * The mock model lives behind {@link LlmClient}. Swap `createMockLlm` for a
 * harness that speaks the same chat, tool, JSON, and completion events.
 *
 * @module
 */

import {
  BLOCK_CONTENT_ATTRIBUTE,
  useEditorRoot,
  useReactEditor,
  type BlockSlotProps,
  type ReactEditor,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { measureCaret, readCaretPlace, type CaretBox } from "./caret.ts";
import { createEditorPort, insertSuggestion } from "./editor-port.ts";
import { createMockLlm } from "./mock-llm.ts";
import { AiSession, type AiSnapshot } from "./session.ts";
import "./ai-agent.css";

const AiSessionContext = createContext<AiSession | null>(null);
const sessions = new WeakMap<ReactEditor, AiSession>();

const AI_BLOCK_EDIT_CLASS = "ai-block-edit";
const AI_PANEL_CLASS = "ai-agent-panel";
const AI_GHOST_CLASS = "ai-ghost";

/** Idle snapshot used when a slot renders before the provider is ready. */
const EMPTY_SNAPSHOT: AiSnapshot = {
  revision: 0,
  open: false,
  running: false,
  draft: "",
  entries: [],
  suggestion: null,
};

/** @returns The session installed on this editor, if the extension is active. */
function useAiSession(): AiSession | null {
  return useContext(AiSessionContext);
}

/** @returns The subscribed session snapshot. */
function useAiSnapshot(session: AiSession | null): AiSnapshot {
  return useSyncExternalStore(
    session ? session.subscribe : subscribeNothing,
    session ? session.getSnapshot : getEmptySnapshot,
    session ? session.getSnapshot : getEmptySnapshot,
  );
}

/** @returns A no-op unsubscribe used when no session is installed. */
function subscribeNothing(): () => void {
  return () => undefined;
}

/** @returns The idle snapshot. */
function getEmptySnapshot(): AiSnapshot {
  return EMPTY_SNAPSHOT;
}

/** Provides the editor's agent session to toolbar, slots, and overlays. */
function AiSessionProvider({ children }: { readonly children?: ReactNode }) {
  const reactEditor = useReactEditor();
  return (
    <AiSessionContext.Provider value={sessions.get(reactEditor) ?? null}>
      {children}
    </AiSessionContext.Provider>
  );
}

/**
 * Toolbar control that opens the agent panel.
 *
 * Render this inside `EditorView`. It stays hidden when the extension is not
 * installed.
 */
export function AiToolbarButton() {
  const session = useAiSession();
  const snapshot = useAiSnapshot(session);
  if (!session) return null;
  return (
    <button
      type="button"
      data-editor-action="ai"
      aria-pressed={snapshot.open}
      aria-expanded={snapshot.open}
      onClick={() => session.setOpen(!snapshot.open)}
    >
      AI
    </button>
  );
}

/** Right-slot control that rewrites the owning block. */
function AiBlockButton({ block }: BlockSlotProps) {
  const session = useAiSession();
  const snapshot = useAiSnapshot(session);
  if (!session) return null;
  return (
    <button
      type="button"
      className={AI_BLOCK_EDIT_CLASS}
      data-ai-edit-block={block.id}
      aria-label="Edit block with AI"
      disabled={snapshot.running}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        session.rewriteBlock(block.id);
      }}
    >
      AI
    </button>
  );
}

/** Chat panel mounted above the document surface. */
function AiAgentPanel() {
  const session = useAiSession();
  const snapshot = useAiSnapshot(session);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [snapshot.entries, snapshot.running]);
  if (!session || !snapshot.open) return null;
  return (
    <section className={AI_PANEL_CLASS} data-ai-panel aria-label="AI agent">
      <header className="ai-agent-heading">
        <h2>AI agent</h2>
        <div className="ai-agent-heading-actions">
          {snapshot.running && (
            <button type="button" onClick={() => session.stop()}>Stop</button>
          )}
          <button type="button" aria-label="Close AI agent" onClick={() => session.setOpen(false)}>Close</button>
        </div>
      </header>
      <div className="ai-agent-log" ref={logRef}>
        {snapshot.entries.length === 0 && (
          <p className="ai-agent-empty">
            Ask the agent to add, rewrite, duplicate, or delete blocks. Each token is written into the document as it arrives.
          </p>
        )}
        {snapshot.entries.map((entry) => (
          entry.kind === "tool" ? (
            <p key={entry.id} className="ai-agent-tool">
              <span>Tool</span> {entry.name} {entry.text}
            </p>
          ) : (
            <p key={entry.id} className={`ai-agent-${entry.kind}`}>
              {entry.kind === "reasoning" && <span>Thinking</span>}
              {entry.kind === "error" && <span>Error</span>}
              {entry.text}
            </p>
          )
        ))}
      </div>
      <div className="ai-agent-actions">
        <button type="button" disabled={snapshot.running} onClick={() => session.addParagraph()}>Add paragraph</button>
        <button type="button" disabled={snapshot.running} onClick={() => session.duplicateFocused()}>Duplicate block</button>
      </div>
      <form
        className="ai-agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          session.send();
        }}
      >
        <textarea
          rows={2}
          value={snapshot.draft}
          aria-label="Message the AI agent"
          placeholder="Add a paragraph, or rewrite the block at the caret"
          onChange={(event) => session.setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              session.send();
            }
          }}
        />
        <button type="submit" disabled={snapshot.running || !snapshot.draft.trim()}>Send</button>
      </form>
      <p className="ai-agent-hint">
        Ghost text finishes the current word and adds a few more. Tab accepts it. Escape dismisses it.
      </p>
    </section>
  );
}

/** Listens for typing and paints the suggestion on the caret. */
function AiCompletion() {
  const session = useAiSession();
  const snapshot = useAiSnapshot(session);
  const { element: root } = useEditorRoot();
  const suggestion = snapshot.suggestion;
  const box = useCaretBox(root, suggestion?.blockId, suggestion?.text);

  useEffect(() => {
    if (!root || !session) return;
    const onInput = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.hasAttribute(BLOCK_CONTENT_ATTRIBUTE)) return;
      session.scheduleCompletion(readCaretPlace(root));
    };
    const onCompositionStart = (): void => session.setComposing(true);
    const onCompositionEnd = (): void => {
      session.setComposing(false);
      session.scheduleCompletion(readCaretPlace(root));
    };
    const onSelection = (): void => {
      const suggestionNow = session.getSnapshot().suggestion;
      if (!suggestionNow) return;
      const place = readCaretPlace(root);
      if (!place || place.blockId !== suggestionNow.blockId || place.prefix !== suggestionNow.prefix) {
        session.clearSuggestion();
      }
    };
    root.addEventListener("input", onInput);
    root.addEventListener("compositionstart", onCompositionStart);
    root.addEventListener("compositionend", onCompositionEnd);
    root.ownerDocument.addEventListener("selectionchange", onSelection);
    return () => {
      root.removeEventListener("input", onInput);
      root.removeEventListener("compositionstart", onCompositionStart);
      root.removeEventListener("compositionend", onCompositionEnd);
      root.ownerDocument.removeEventListener("selectionchange", onSelection);
    };
  }, [root, session]);

  if (!suggestion?.text || !box) return null;
  return (
    <span
      className={AI_GHOST_CLASS}
      data-ai-suggestion=""
      aria-hidden="true"
      style={{ left: box.left, top: box.top, font: box.font, lineHeight: box.lineHeight }}
    >
      {suggestion.text}
    </span>
  );
}

/**
 * Tracks the caret box while a suggestion is visible.
 *
 * @param root - Surface root.
 * @param blockId - Block the suggestion belongs to.
 * @param text - Suggestion text. Changes retrigger measurement.
 * @returns The latest box, or null.
 */
function useCaretBox(
  root: HTMLElement | null,
  blockId: string | undefined,
  text: string | undefined,
): CaretBox | null {
  const [box, setBox] = useState<CaretBox | null>(null);
  useLayoutEffect(() => {
    if (!root || !blockId) {
      setBox(null);
      return;
    }
    const measure = (): void => setBox(measureCaret(root, blockId));
    measure();
    const view = root.ownerDocument.defaultView;
    view?.addEventListener("scroll", measure, true);
    view?.addEventListener("resize", measure);
    return () => {
      view?.removeEventListener("scroll", measure, true);
      view?.removeEventListener("resize", measure);
    };
  }, [root, blockId, text]);
  return box;
}

/**
 * Installs the demo agent, the right-slot edit button, and inline completion.
 *
 * Tab accepts ghost text and beats block indent only while a suggestion is
 * showing. Escape dismisses it. With no suggestion, Tab still indents.
 */
export function aiAgentExtension(): ReactEditorExtension {
  return {
    id: "demo.ai-agent",
    setup(reactEditor) {
      const session = new AiSession(
        reactEditor,
        createMockLlm(),
        createEditorPort(reactEditor),
        (blockId, text) => insertSuggestion(reactEditor, blockId, text),
      );
      sessions.set(reactEditor, session);
      const releaseWrapper = reactEditor.surfaces.registerEditorWrapper(AiSessionProvider);
      const releaseSlot = reactEditor.surfaces.registerBlockSlot({
        position: "right",
        component: AiBlockButton,
      });
      const releasePanel = reactEditor.extensions.mount(AiAgentPanel);
      const releaseGhost = reactEditor.extensions.mount(AiCompletion, "afterSurface");
      const releaseAccept = reactEditor.keyboard.register({
        id: "demo.ai.accept-completion",
        keys: ["Tab"],
        priority: 110,
        when: (event) => session.canAccept(event.blockId),
      }, () => session.acceptSuggestion());
      const releaseDismiss = reactEditor.keyboard.register({
        id: "demo.ai.dismiss-completion",
        keys: ["Escape"],
        priority: 110,
        when: () => session.hasSuggestion(),
      }, () => session.clearSuggestion());
      return () => {
        releaseDismiss();
        releaseAccept();
        releaseGhost();
        releasePanel();
        releaseSlot();
        releaseWrapper();
        session.dispose();
        sessions.delete(reactEditor);
      };
    },
  };
}
