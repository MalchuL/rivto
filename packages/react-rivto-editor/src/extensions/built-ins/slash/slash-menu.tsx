/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { SlashCommand } from "../../../managers/slash";
import { createCaretSelection } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../../constants";
import {
  useDOMEvent,
  useReactEditor,
  useEditorRoot,
  useKeyboardEvent,
} from "../../../hooks";
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
} from "../../../managers";
import { keepNoResultMenuOpen, rankSlashCommands } from "./slash-search";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "../../../components/ui/command";

/**
 * Floating menu chrome. The root is the scroll container so long command lists
 * scroll while the highlighted item stays visible; cmdk's own list keeps no
 * height limit of its own.
 */
const SLASH_MENU_CLASS = "slash-menu fixed z-[1000] h-auto w-[min(280px,calc(100vw-24px))] max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg";

interface SlashSession {
  readonly blockId: string;
  readonly slashOffset: number;
  readonly query: string;
  readonly lastMatchedLength: number;
  readonly left: number;
  readonly top: number;
  readonly above: boolean;
  readonly activeIndex: number;
}

/** Returns the last valid slash trigger ending at a collapsed caret. */
function findSlash(source: string, caret: number): { slashOffset: number; query: string } | undefined {
  const prefix = source.slice(0, caret);
  const slashOffset = prefix.lastIndexOf("/");
  if (slashOffset < 0 || /\s/.test(prefix.slice(slashOffset + 1))) return;
  return { slashOffset, query: prefix.slice(slashOffset + 1) };
}

/**
 * Measures the live caret and chooses the menu edge that stays beside it.
 *
 * An upward menu stores its bottom anchor rather than its top, so filtering
 * moves the top down while the final choice remains next to the caret.
 *
 * @param content - Editable region containing the active slash query.
 * @returns Viewport coordinates and the side used to anchor the menu.
 */
function popupPosition(content: HTMLElement): Pick<SlashSession, "left" | "top" | "above"> {
  const selection = content.ownerDocument.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined;
  const fallback = content.getBoundingClientRect();
  const viewport = content.ownerDocument.defaultView;
  const desiredTop = (rect?.bottom || fallback.bottom) + 6;
  const above = Boolean(viewport && desiredTop + 320 > viewport.innerHeight);
  const top = above ? (rect?.top || fallback.top) - 6 : desiredTop;
  return {
    left: viewport
      ? Math.max(8, Math.min(rect?.left || fallback.left, viewport.innerWidth - 292))
      : rect?.left || fallback.left,
    top,
    above,
  };
}

/** Reads a collapsed native caret owned by the supplied editable element. */
function caretOffset(content: HTMLElement): number | undefined {
  const selection = content.ownerDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !selection.focusNode || !content.contains(selection.focusNode)) return;
  const range = content.ownerDocument.createRange();
  range.selectNodeContents(content);
  let offset: number | undefined;
  try {
    range.setEnd(selection.focusNode, selection.focusOffset);
    offset = range.toString().length;
  } catch {
    offset = undefined;
  }
  return offset;
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
 * The trigger and query remain ordinary collaborative text. This extension stores
 * only ephemeral caret geometry and the original slash offset; it never owns a
 * second input field. Command execution removes `/query` and runs the selected
 * manager action inside one document transaction, making both changes one undo
 * step while the preceding typing stays a separate capture.
 */
export function SlashMenu() {
  const reactEditor = useReactEditor();
  const roots = reactEditor.blocks.getBlocks();
  const slashCommands = reactEditor.slashCommands;
  const { element: root } = useEditorRoot();
  const [session, setSession] = useState<SlashSession | null>(null);
  const sessionRef = useRef(session);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const ignoredTrigger = useRef<string | undefined>(undefined);
  sessionRef.current = session;

  const subscribe = useCallback((listener: () => void) => slashCommands.subscribe(listener), [slashCommands]);
  useSyncExternalStore(subscribe, () => slashCommands.revision, () => slashCommands.revision);

  const available = useMemo(() => session
    ? slashCommands.getAll({ blockId: session.blockId })
    : [], [slashCommands, slashCommands.revision, session?.blockId]);
  const ranked = useMemo(() => rankSlashCommands(available, session?.query ?? ""), [available, session?.query]);
  const groups = useMemo(() => groupCommands(ranked.map(({ command }) => command)), [ranked]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [ranked, session?.activeIndex]);

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
    const triggerChanged = Boolean(
      current && trigger && (current.blockId !== blockId || current.slashOffset !== trigger.slashOffset),
    );

    if (!trigger || triggerChanged) {
      if (current) setSession(null);
      if (!trigger) ignoredTrigger.current = undefined;
    }

    const key = trigger ? `${blockId}:${trigger.slashOffset}` : undefined;
    if (
      trigger && key &&
      (discover || !triggerChanged) &&
      (current || (discover && ignoredTrigger.current !== key))
    ) {
      const commands = slashCommands.getAll({ blockId });
      const matches = rankSlashCommands(commands, trigger.query);
      const lastMatchedLength = matches.length
        ? trigger.query.length
        : current?.lastMatchedLength ?? 0;
      if (!matches.length && !keepNoResultMenuOpen(trigger.query.length, lastMatchedLength)) {
        ignoredTrigger.current = key;
        setSession(null);
      } else {
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
      }
    }
  }, [slashCommands]);

  useDOMEvent({
    id: "slash.input",
    type: "input",
    scope: "content",
  }, ({ raw: event }) => {
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
    if (session && !reactEditor.blocks.hasBlock(session.blockId)) close();
  }, [close, reactEditor, roots, session]);

  useDOMEvent({
    id: "slash.selection-change",
    type: "selectionchange",
    target: "document",
  }, () => {
    const current = sessionRef.current;
    if (root && current) {
      const block = findRenderedBlock(root, current.blockId);
      const content = block?.querySelector<HTMLElement>(BLOCK_CONTENT_SELECTOR);
      if (!content || content.closest(BLOCK_ID_SELECTOR) !== block) return close();
      refresh(content, current.blockId, false);
    }
  });

  const execute = useCallback((command: SlashCommand) => {
    const current = sessionRef.current;
    if (!current || !root) return;
    const block = reactEditor.blocks.getBlockNode(current.blockId);
    if (!block) return close();
    const caret = current.slashOffset + current.query.length + 1;
    if (block.content.slice(current.slashOffset, caret) !== `/${current.query}`) return close();

    reactEditor.history.batchUpdates(() => {
      const next = block.content.slice(0, current.slashOffset) + block.content.slice(caret);
      reactEditor.blocks.updateBlock(current.blockId, { content: next });
      reactEditor.selection.set(createCaretSelection(current.blockId, current.slashOffset));
      slashCommands.execute(command.id, { blockId: current.blockId });
    });
    setSession(null);

    requestAnimationFrame(() => {
      if (reactEditor.selection.restoreDOM()) return;
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
    });
  }, [close, reactEditor, root, slashCommands]);

  const currentResults = useCallback(() => {
    const current = sessionRef.current;
    return current
      ? groupCommands(rankSlashCommands(
        slashCommands.getAll({ blockId: current.blockId }),
        current.query,
      ).map(({ command }) => command)).flatMap(({ commands }) => commands)
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
    priority: 100,
    when: () => Boolean(sessionRef.current),
  }, () => {
    close(true);
    return true;
  });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashPrevious,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashPrevious],
    priority: 100,
    when: () => Boolean(sessionRef.current),
  }, () => moveActive(-1));

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashNext,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashNext],
    priority: 100,
    when: () => Boolean(sessionRef.current),
  }, () => moveActive(1));

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.slashExecute,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashExecute],
    priority: 100,
    when: () => Boolean(sessionRef.current),
  }, () => {
    const current = sessionRef.current;
    if (!current) return false;
    const results = currentResults();
    const command = results[current.activeIndex] ?? results[0];
    if (!command) return false;
    execute(command);
    return true;
  });

  /** Syncs cmdk pointer highlighting back into the session's active index. */
  const selectByValue = useCallback((value: string) => {
    const index = currentResults().findIndex((command) => command.id === value);
    if (index < 0) return;
    setSession((current) => current && current.activeIndex !== index
      ? { ...current, activeIndex: index }
      : current);
  }, [currentResults]);

  if (!root || !session) return null;
  const flat = groups.flatMap(({ commands }) => commands);
  const activeCommand = flat[session.activeIndex] ?? flat[0];
  let resultIndex = 0;
  // cmdk provides list semantics and pointer highlighting only. Filtering is
  // disabled because ranking already happened, and keyboard navigation stays
  // with the editor keymap so focus never leaves the editable block.
  return createPortal(
    <Command
      shouldFilter={false}
      value={activeCommand?.id ?? ""}
      onValueChange={selectByValue}
      className={SLASH_MENU_CLASS}
      data-slash-menu="true"
      aria-label="Slash commands"
      style={{
        left: session.left,
        top: session.top,
        transform: session.above ? "translateY(-100%)" : undefined,
        maxHeight: session.above ? Math.min(320, Math.max(0, session.top - 8)) : undefined,
      }}
      onPointerDown={(event) => event.preventDefault()}
    >
      <CommandList className="max-h-none overflow-visible">
        {ranked.length ? groups.map(({ group, commands }) => (
          <CommandGroup key={group} heading={group}>
            {commands.map((command) => {
              const index = resultIndex++;
              return (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  data-slash-command={command.id}
                  data-active={index === session.activeIndex || undefined}
                  ref={index === session.activeIndex ? activeItemRef : undefined}
                  onSelect={() => execute(command)}
                >
                  {command.title}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )) : <CommandEmpty className="px-2 py-2.5 text-sm text-muted-foreground">No matching commands</CommandEmpty>}
      </CommandList>
    </Command>,
    root.ownerDocument.body,
  );
}
