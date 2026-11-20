/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../../../components/ui/command";
import { useDOMEvent, useReactPanel, useKeyboardEvent } from "../../../hooks";
import { EditorPortal } from "../../../components/editor-panel/editor-portal";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers";
import type { SlashCommand } from "../../../managers/slash";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../../constants";
import type { ContentCaretGeometry, ContentInput } from "../../../managers/events/types";
import type { SlashSession } from "./types";
import { keepNoResultMenuOpen, rankSlashCommands } from "./slash-search";

/**
 * Floating menu chrome. The root is the scroll container so long command lists
 * scroll while the highlighted item stays visible; cmdk's own list keeps no
 * height limit of its own.
 */
const SLASH_MENU_CLASS =
  "slash-menu fixed z-[1000] h-auto overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg";

/** Host-adjustable dimensions used by the floating slash menu. */
export interface SlashMenuPositionOptions {
  /** Preferred menu width in pixels. */
  readonly width?: number;
  /** Maximum menu height in pixels. */
  readonly maxHeight?: number;
  /** Distance from the caret in pixels. */
  readonly gap?: number;
  /** Minimum distance from viewport edges in pixels. */
  readonly viewportPadding?: number;
}

const DEFAULT_POSITION = { width: 280, maxHeight: 320, gap: 6, viewportPadding: 8 };

/** Returns the last valid slash trigger ending at a collapsed caret. */
function findSlash(
  source: string,
  caret: number,
): { slashOffset: number; query: string } | undefined {
  const prefix = source.slice(0, caret);
  const slashOffset = prefix.lastIndexOf("/");
  if (slashOffset < 0 || /\s/.test(prefix.slice(slashOffset + 1))) {
    return;
  }
  return { slashOffset, query: prefix.slice(slashOffset + 1) };
}

/**
 * Chooses a popup position from copied viewport-relative caret geometry.
 *
 * An upward menu stores its bottom anchor rather than its top, so filtering
 * moves the top down while the final choice remains next to the caret.
 *
 * @param geometry - Copied caret, content, and viewport geometry for the active query.
 * @param options - Resolved menu dimensions and viewport spacing.
 * @returns Viewport coordinates and the side used to anchor the menu.
 */
export function popupPosition(
  geometry: ContentCaretGeometry,
  options: Required<SlashMenuPositionOptions> = DEFAULT_POSITION,
): Pick<SlashSession, "left" | "top" | "above"> {
  const rect = geometry.caret;
  const fallback = geometry.content;
  const viewport = geometry.viewport;
  const desiredTop = (rect?.bottom || fallback.bottom) + options.gap;
  const above = Boolean(
    viewport && desiredTop + options.maxHeight > viewport.height - options.viewportPadding,
  );
  const top = above ? (rect?.top || fallback.top) - options.gap : desiredTop;
  return {
    left: viewport
      ? Math.max(
          options.viewportPadding,
          Math.min(
            rect?.left || fallback.left,
            viewport.width - options.width - options.viewportPadding,
          ),
        )
      : rect?.left || fallback.left,
    top,
    above,
  };
}

/** Groups already-ranked commands without changing their search order. */
function groupCommands(
  commands: readonly SlashCommand[],
): Array<{ group: string; commands: SlashCommand[] }> {
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
 *
 * @param props - Slash menu configuration.
 * @param props.options - Optional viewport dimensions and spacing for the menu.
 * @returns A portal containing the current command menu, or null without an active query.
 * @throws If rendered outside an editor panel or delegated browser operations fail.
 */
export function SlashMenu({ options = {} }: { readonly options?: SlashMenuPositionOptions }) {
  const width = Math.max(1, options.width ?? DEFAULT_POSITION.width);
  const maxHeight = Math.max(1, options.maxHeight ?? DEFAULT_POSITION.maxHeight);
  const gap = Math.max(0, options.gap ?? DEFAULT_POSITION.gap);
  const viewportPadding = Math.max(0, options.viewportPadding ?? DEFAULT_POSITION.viewportPadding);
  const reactPanel = useReactPanel();
  const roots = reactPanel.blocks.getBlocks();
  const slashCommands = reactPanel.slashCommands;
  const [session, setSession] = useState<SlashSession | null>(null);
  const sessionRef = useRef(session);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const ignoredTrigger = useRef<string | undefined>(undefined);
  sessionRef.current = session;

  const subscribe = useCallback(
    (listener: () => void) => slashCommands.subscribe(listener),
    [slashCommands],
  );
  useSyncExternalStore(
    subscribe,
    () => slashCommands.revision,
    () => slashCommands.revision,
  );

  const available = useMemo(
    () => (session ? slashCommands.getAll({ blockId: session.blockId }) : []),
    [
      reactPanel,
      slashCommands,
      slashCommands.revision,
      session?.blockId,
      session?.document,
      session?.rootBlockId,
    ],
  );
  const ranked = useMemo(
    () => rankSlashCommands(available, session?.query ?? ""),
    [available, session?.query],
  );
  const groups = useMemo(() => groupCommands(ranked.map(({ command }) => command)), [ranked]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [ranked, session?.activeIndex]);

  const close = useCallback((ignore = false) => {
    const current = sessionRef.current;
    if (ignore && current) {
      ignoredTrigger.current = `${current.blockId}:${current.slashOffset}`;
    }
    setSession(null);
  }, []);

  useEffect(() => reactPanel.subscribeDeactivation(close), [reactPanel, close]);

  /**
   * Updates the slash session from a caret in the initiating input registration.
   *
   * @param content - Borrowed content operations used to read and position the query.
   * @param blockId - Block containing the edited content.
   * @param discover - Whether this input may open a previously closed query.
   * @param inputRoot - Root that received the input.
   * @param inputRegistration - Routing lifetime that received the input.
   * @returns The current session is updated, closed, or left unchanged when input is stale.
   * @throws Propagates caret, geometry, and command lookup failures.
   */
  const refresh = useCallback(
    (
      content: Pick<ContentInput, "readCaret" | "measureCaret">,
      blockId: string,
      discover: boolean,
      inputRoot: SlashSession["inputRoot"],
      inputRegistration: SlashSession["inputRegistration"],
    ) => {
      if (!inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      const { text: source, offset } = content.readCaret();
      if (!inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      const trigger = offset === undefined ? undefined : findSlash(source, offset);
      const previous = sessionRef.current;
      const current =
        previous?.inputRegistration === inputRegistration &&
        previous.inputRoot === inputRoot &&
        inputRegistration.isCurrent(inputRoot)
          ? previous
          : null;
      if (previous && !current) {
        setSession(null);
      }
      const triggerChanged = Boolean(
        current &&
        trigger &&
        (current.blockId !== blockId || current.slashOffset !== trigger.slashOffset),
      );

      if (!trigger || triggerChanged) {
        if (current) {
          setSession(null);
        }
        if (!trigger) {
          ignoredTrigger.current = undefined;
        }
      }

      const key = trigger ? `${blockId}:${trigger.slashOffset}` : undefined;
      if (
        trigger &&
        key &&
        (discover || !triggerChanged) &&
        (current || (discover && ignoredTrigger.current !== key))
      ) {
        const commands = slashCommands.getAll({ blockId });
        const matches = rankSlashCommands(commands, trigger.query);
        const lastMatchedLength = matches.length
          ? trigger.query.length
          : (current?.lastMatchedLength ?? 0);
        if (!matches.length && !keepNoResultMenuOpen(trigger.query.length, lastMatchedLength)) {
          ignoredTrigger.current = key;
          setSession(null);
        } else {
          const position = popupPosition(content.measureCaret(), {
            width,
            maxHeight,
            gap,
            viewportPadding,
          });
          if (!inputRegistration.isCurrent(inputRoot)) {
            return;
          }
          setSession({
            document: reactPanel.document.getDocument(),
            rootBlockId: reactPanel.rootBlockId,
            inputRoot,
            inputRegistration,
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
    },
    [reactPanel, slashCommands, width, maxHeight, gap, viewportPadding],
  );

  useDOMEvent(
    {
      id: "slash.input",
      type: "input",
      scope: "content",
    },
    ({ contentInput: content, textInput, inputRoot, inputRegistration }) => {
      const blockId = content?.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE);
      if (
        !content ||
        !blockId ||
        !Object.is(reactPanel.inputRoot, inputRoot) ||
        !inputRegistration.isCurrent(inputRoot)
      ) {
        return;
      }
      // Counter is contentless; Markdown and Slider both expose the same marker.
      // Discover only a slash inserted by this input event. Once open, ordinary
      // query edits continue refreshing it; old URL/path slashes never reopen.
      const discover =
        Boolean(sessionRef.current?.inputRegistration.isCurrent(sessionRef.current.inputRoot)) ||
        (textInput?.inputType === "insertText" && textInput.data === "/");
      queueMicrotask(() => {
        if (
          inputRegistration.isCurrent(inputRoot) &&
          content.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE) === blockId
        ) {
          refresh(content, blockId, discover, inputRoot, inputRegistration);
        }
      });
    },
  );

  useEffect(() => {
    if (
      session &&
      (!session.inputRegistration.isCurrent(session.inputRoot) ||
        !session.inputRoot.isConnected() ||
        !reactPanel.blocks.hasBlock(session.blockId))
    ) {
      close();
    }
  }, [close, reactPanel, roots, session]);

  useDOMEvent(
    {
      id: "slash.selection-change",
      type: "selectionchange",
      target: "document",
    },
    ({ inputRoot, inputRegistration }) => {
      const current = sessionRef.current;
      if (current) {
        if (
          !current.inputRegistration.isCurrent(current.inputRoot) ||
          inputRoot !== current.inputRoot ||
          inputRegistration !== current.inputRegistration
        ) {
          return close();
        }
        const content = reactPanel.selection.contentInput(current.blockId);
        if (!content) {
          return close();
        }
        refresh(content, current.blockId, false, current.inputRoot, current.inputRegistration);
      }
    },
  );

  const execute = useCallback(
    (command: SlashCommand) => {
      const current = sessionRef.current;
      if (!current) {
        return;
      }
      if (!current.inputRegistration.isCurrent(current.inputRoot)) {
        return close();
      }

      const block = reactPanel.blocks.getBlockNode(current.blockId);
      if (!block) {
        return close();
      }
      const caret = current.slashOffset + current.query.length + 1;
      if (block.content.slice(current.slashOffset, caret) !== `/${current.query}`) {
        return close();
      }
      if (!current.inputRegistration.isCurrent(current.inputRoot)) {
        return close();
      }

      reactPanel.batchUpdates(() => {
        const next = block.content.slice(0, current.slashOffset) + block.content.slice(caret);
        reactPanel.blocks.updateBlock(current.blockId, { content: next });
        reactPanel.selection.set(createCaretSelection(current.blockId, current.slashOffset));
        slashCommands.execute(command.id, { blockId: current.blockId });
      });
      setSession(null);

      if (!current.inputRegistration.isCurrent(current.inputRoot)) {
        return;
      }

      reactPanel.selection.scheduleIfSelectionUnchanged(() => {
        if (!current.inputRegistration.isCurrent(current.inputRoot)) {
          return;
        }
        if (reactPanel.selection.restoreDOM()) {
          return;
        }
        if (current.inputRegistration.isCurrent(current.inputRoot)) {
          current.inputRoot.clearSelection();
        }
        if (current.inputRegistration.isCurrent(current.inputRoot)) {
          current.inputRoot.focus();
        }
      });
    },
    [close, reactPanel, slashCommands],
  );

  const currentResults = useCallback(() => {
    const current = sessionRef.current;
    return current
      ? groupCommands(
          rankSlashCommands(slashCommands.getAll({ blockId: current.blockId }), current.query).map(
            ({ command }) => command,
          ),
        ).flatMap(({ commands }) => commands)
      : [];
  }, [slashCommands]);

  const moveActive = useCallback(
    (delta: number) => {
      const results = currentResults();
      if (!results.length) {
        return false;
      }
      setSession(
        (value) =>
          value && {
            ...value,
            activeIndex: (value.activeIndex + delta + results.length) % results.length,
          },
      );
      return true;
    },
    [currentResults],
  );

  /**
   * Checks that a keyboard delivery belongs to the open slash session.
   *
   * @param inputRoot - Root that received the keyboard input.
   * @param inputRegistration - Routing lifetime that received the input.
   * @returns True when the same session still owns the input.
   * @throws Propagates registration validity failures.
   */
  const ownsSession = (
    inputRoot: Pick<SlashSession["inputRoot"], "isAttached">,
    inputRegistration: SlashSession["inputRegistration"],
  ): boolean => {
    const current = sessionRef.current;
    return Boolean(
      current &&
      current.inputRoot === inputRoot &&
      current.inputRegistration === inputRegistration &&
      inputRegistration.isCurrent(inputRoot),
    );
  };

  useKeyboardEvent(
    {
      id: KEYBOARD_BINDING_IDS.slashClose,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashClose],
      priority: 100,
      when: ({ inputRoot, inputRegistration }) => ownsSession(inputRoot, inputRegistration),
    },
    () => {
      close(true);
      return true;
    },
  );

  useKeyboardEvent(
    {
      id: KEYBOARD_BINDING_IDS.slashPrevious,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashPrevious],
      priority: 100,
      when: ({ inputRoot, inputRegistration }) => ownsSession(inputRoot, inputRegistration),
    },
    () => moveActive(-1),
  );

  useKeyboardEvent(
    {
      id: KEYBOARD_BINDING_IDS.slashNext,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashNext],
      priority: 100,
      when: ({ inputRoot, inputRegistration }) => ownsSession(inputRoot, inputRegistration),
    },
    () => moveActive(1),
  );

  useKeyboardEvent(
    {
      id: KEYBOARD_BINDING_IDS.slashExecute,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.slashExecute],
      priority: 100,
      when: ({ inputRoot, inputRegistration }) => ownsSession(inputRoot, inputRegistration),
    },
    () => {
      const current = sessionRef.current;
      if (!current) {
        return false;
      }
      const results = currentResults();
      const command = results[current.activeIndex] ?? results[0];
      if (!command) {
        return false;
      }
      execute(command);
      return true;
    },
  );

  /** Syncs cmdk pointer highlighting back into the session's active index. */
  const selectByValue = useCallback(
    (value: string) => {
      const index = currentResults().findIndex((command) => command.id === value);
      if (index < 0) {
        return;
      }
      setSession((current) =>
        current && current.activeIndex !== index ? { ...current, activeIndex: index } : current,
      );
    },
    [currentResults],
  );

  if (!session || !session.inputRegistration.isCurrent(session.inputRoot)) {
    return null;
  }
  const flat = groups.flatMap(({ commands }) => commands);
  const activeCommand = flat[session.activeIndex] ?? flat[0];
  let resultIndex = 0;
  // cmdk provides list semantics and pointer highlighting only. Filtering is
  // disabled because ranking already happened, and keyboard navigation stays
  // with the editor keymap so focus never leaves the editable block.
  return (
    <EditorPortal inputRoot={session.inputRoot} inputRegistration={session.inputRegistration}>
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
          width: `min(${width}px, calc(100vw - ${viewportPadding * 2}px))`,
          maxHeight: Math.min(
            maxHeight,
            Math.max(
              0,
              session.above
                ? session.top - viewportPadding
                : (session.inputRoot.readViewport()?.height ?? maxHeight) -
                    session.top -
                    viewportPadding,
            ),
          ),
        }}
        onPointerDown={(event) => event.preventDefault()}
      >
        <CommandList className="max-h-none overflow-visible">
          {ranked.length ? (
            groups.map(({ group, commands }) => (
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
            ))
          ) : (
            <CommandEmpty className="px-2 py-2.5 text-sm text-muted-foreground">
              No matching commands
            </CommandEmpty>
          )}
        </CommandList>
      </Command>
    </EditorPortal>
  );
}
