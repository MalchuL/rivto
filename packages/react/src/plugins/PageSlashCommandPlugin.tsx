import type { SlashCommand } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../constants";
import {
  useDOMEvent,
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
  useReactEditor,
} from "../hooks";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  BUILTIN_KEYMAP,
  findRenderedBlock,
  KEYBOARD_BINDING_IDS,
} from "../managers";
import { keepNoResultMenuOpen, rankSlashCommands } from "./utils/slash-search";

interface SlashSession {
  readonly blockId: string;
  readonly slashOffset: number;
  readonly query: string;
  readonly lastMatchedLength: number;
  readonly left: number;
  readonly top: number;
  readonly activeIndex: number;
}

/** Returns the last valid slash trigger ending at a collapsed caret. */
function findSlash(source: string, caret: number): { slashOffset: number; query: string } | undefined {
  const prefix = source.slice(0, caret);
  const slashOffset = prefix.lastIndexOf("/");
  if (slashOffset < 0 || /\s/.test(prefix.slice(slashOffset + 1))) return;
  return { slashOffset, query: prefix.slice(slashOffset + 1) };
}

/** Measures the live caret, falling back to the editable block's lower edge. */
function popupPosition(content: HTMLElement): Pick<SlashSession, "left" | "top"> {
  const selection = content.ownerDocument.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined;
  const fallback = content.getBoundingClientRect();
  const viewport = content.ownerDocument.defaultView;
  const desiredTop = (rect?.bottom || fallback.bottom) + 6;
  const top = viewport && desiredTop + 320 > viewport.innerHeight
    ? Math.max(8, (rect?.top || fallback.top) - 326)
    : desiredTop;
  return {
    left: viewport
      ? Math.max(8, Math.min(rect?.left || fallback.left, viewport.innerWidth - 292))
      : rect?.left || fallback.left,
    top,
  };
}

/** Reads a collapsed native caret owned by the supplied editable element. */
function caretOffset(content: HTMLElement): number | undefined {
  const selection = content.ownerDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !selection.focusNode || !content.contains(selection.focusNode)) return;
  const range = content.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(selection.focusNode, selection.focusOffset);
  } catch {
    return;
  }
  return range.toString().length;
}

/** Groups already-ranked commands without changing their search order. */
function groupCommands(commands: readonly SlashCommand[]): Array<{ group: string; commands: SlashCommand[] }> {
  const groups = new Map<string, SlashCommand[]>();
  commands.forEach((command) => {
    const group = command.group ?? "Commands";
    groups.set(group, [...(groups.get(group) ?? []), command]);
  });
  return [...groups].map(([group, items]) => ({ group, commands: items }));
}

/**
 * Package-owned inline slash menu for editable blocks.
 *
 * The trigger and query remain ordinary collaborative text. This plugin stores
 * only ephemeral caret geometry and the original slash offset; it never owns a
 * second input field. Command execution removes `/query` and runs the selected
 * manager action inside one document transaction, making both changes one undo
 * step while the preceding typing stays a separate capture.
 */
export function PageSlashCommandPlugin() {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const slashCommands = reactEditor.slashCommands;
  const { element: root } = useEditorRoot();
  const [session, setSession] = useState<SlashSession | null>(null);
  const sessionRef = useRef(session);
  const ignoredTrigger = useRef<string | undefined>(undefined);
  sessionRef.current = session;

  const subscribe = useCallback((listener: () => void) => slashCommands.subscribe(listener), [slashCommands]);
  useSyncExternalStore(subscribe, () => slashCommands.revision, () => slashCommands.revision);

  const available = useMemo(() => session
    ? slashCommands.getAll({ blockId: session.blockId })
    : [], [slashCommands, slashCommands.revision, session?.blockId]);
  const ranked = useMemo(() => rankSlashCommands(available, session?.query ?? ""), [available, session?.query]);
  const groups = useMemo(() => groupCommands(ranked.map(({ command }) => command)), [ranked]);

  const close = useCallback((ignore = false) => {
    const current = sessionRef.current;
    if (ignore && current) ignoredTrigger.current = `${current.blockId}:${current.slashOffset}`;
    setSession(null);
  }, []);

  /** Validates the current caret and optionally discovers a freshly typed slash. */
  const refresh = useCallback((content: HTMLElement, blockId: string, discover: boolean) => {
    const offset = caretOffset(content);
    const source = content.textContent ?? "";
    const trigger = offset === undefined ? undefined : findSlash(source, offset);
    const current = sessionRef.current;

    if (!trigger || (current && (current.blockId !== blockId || current.slashOffset !== trigger.slashOffset))) {
      if (current) setSession(null);
      if (!trigger) ignoredTrigger.current = undefined;
      if (!discover) return;
    }
    if (!trigger) return;

    const key = `${blockId}:${trigger.slashOffset}`;
    if (!current && (!discover || ignoredTrigger.current === key)) return;
    const commands = slashCommands.getAll({ blockId });
    const matches = rankSlashCommands(commands, trigger.query);
    const lastMatchedLength = matches.length
      ? trigger.query.length
      : current?.lastMatchedLength ?? 0;
    if (!matches.length && !keepNoResultMenuOpen(trigger.query.length, lastMatchedLength)) {
      ignoredTrigger.current = key;
      setSession(null);
      return;
    }

    const position = popupPosition(content);
    setSession({
      blockId,
      slashOffset: trigger.slashOffset,
      query: trigger.query,
      lastMatchedLength,
      ...position,
      activeIndex: matches.length
        ? Math.min(current?.activeIndex ?? 0, matches.length - 1)
        : 0,
    });
  }, [slashCommands]);

  useDOMEvent("input", ({ event }) => {
    const content = event.target instanceof Element
      ? event.target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR)
      : null;
    const blockId = content?.closest<HTMLElement>(BLOCK_ID_SELECTOR)?.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!content || !blockId || !root?.contains(content)) return;
    // Counter is contentless; Markdown and Slider both expose the same marker.
    // Discover only a slash inserted by this input event. Once open, ordinary
    // query edits continue refreshing it; old URL/path slashes never reopen.
    const discover = Boolean(sessionRef.current) || (
      event instanceof InputEvent && event.inputType === "insertText" && event.data === "/"
    );
    queueMicrotask(() => refresh(content, blockId, discover));
  });

  useEffect(() => {
    if (session && !editor.getBlock(session.blockId)) close();
  }, [close, editor, editor.revision, session]);

  useDOMEvent("selectionchange", () => {
    const current = sessionRef.current;
    if (root && current) {
      const block = findRenderedBlock(root, current.blockId);
      const content = block?.querySelector<HTMLElement>(BLOCK_CONTENT_SELECTOR);
      if (!content || content.closest(BLOCK_ID_SELECTOR) !== block) return close();
      refresh(content, current.blockId, false);
    }
  }, { target: "document" });

  const execute = useCallback((command: SlashCommand) => {
    const current = sessionRef.current;
    if (!current || !root) return;
    const block = editor.getBlock(current.blockId);
    if (!block) return close();
    const caret = current.slashOffset + current.query.length + 1;
    if (block.content.slice(current.slashOffset, caret) !== `/${current.query}`) return close();

    editor.history.stopCapturing();
    editor.document.transact(() => {
      editor.updateBlock(current.blockId, {
        content: block.content.slice(0, current.slashOffset) + block.content.slice(caret),
      });
      editor.selection.set([{
        type: "text",
        anchor: { blockId: current.blockId, offset: current.slashOffset },
        head: { blockId: current.blockId, offset: current.slashOffset },
      }]);
      slashCommands.execute(command.id, { blockId: current.blockId });
    });
    editor.history.stopCapturing();
    setSession(null);

    requestAnimationFrame(() => {
      if (reactEditor.selection.restoreDOM()) return;
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
    });
  }, [close, editor, reactEditor, root, slashCommands]);

  const currentResults = useCallback(() => {
    const current = sessionRef.current;
    return current
      ? rankSlashCommands(slashCommands.getAll({ blockId: current.blockId }), current.query)
      : [];
  }, [slashCommands]);

  const moveActive = useCallback((delta: number) => {
    const results = currentResults();
    if (!results.length) return false;
    setSession((value) => value && ({
      ...value,
      activeIndex: (value.activeIndex + delta + results.length) % results.length,
    }));
    return true;
  }, [currentResults]);

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashClose,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashClose],
    mode: "block",
    when: () => Boolean(sessionRef.current),
  }, () => {
    close(true);
    return true;
  });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashPrevious,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashPrevious],
    mode: "block",
    when: () => Boolean(sessionRef.current),
  }, () => moveActive(-1));

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashNext,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashNext],
    mode: "block",
    when: () => Boolean(sessionRef.current),
  }, () => moveActive(1));

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashExecute,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashExecute],
    mode: "block",
    when: () => Boolean(sessionRef.current),
  }, () => {
    const current = sessionRef.current;
    if (!current) return false;
    const results = currentResults();
    const command = results[current.activeIndex]?.command ?? results[0]?.command;
    if (!command) return false;
    execute(command);
    return true;
  });

  if (!root || !session) return null;
  let resultIndex = 0;
  return createPortal(
    <div
      className="slash-menu"
      data-slash-menu="true"
      role="menu"
      aria-label="Slash commands"
      style={{ left: session.left, top: session.top }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {ranked.length ? groups.map(({ group, commands }) => (
        <div key={group} role="group" aria-label={group}>
          <div className="slash-menu-group">{group}</div>
          {commands.map((command) => {
            const index = resultIndex++;
            return (
              <button
                key={command.id}
                type="button"
                role="menuitem"
                className="slash-menu-item"
                data-slash-command={command.id}
                data-active={index === session.activeIndex || undefined}
                onClick={() => execute(command)}
              >
                {command.title}
              </button>
            );
          })}
        </div>
      )) : <div className="slash-menu-empty">No matching commands</div>}
    </div>,
    root.ownerDocument.body,
  );
}
