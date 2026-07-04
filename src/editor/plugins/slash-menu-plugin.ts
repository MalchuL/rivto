import type { BlockInput } from "../../store/document-model";
import type { BlockRegistry } from "../blocks";
import type { EditorMode, RivtoEditorApi } from "../editor";
import type { RivtoPlugin } from "../managers";

/** Checks the detached block tree without reaching into DocumentModel internals. */
const hasBlock = (editor: RivtoEditorApi, id: string): boolean => editor.document.document.some(
  function find(block): boolean { return block.id === id || block.children.some(find); },
);

/** Stable ID used to find the built-in slash-menu plugin. */
export const SLASH_MENU_PLUGIN_ID = "rivto.slash-menu";

/** Describes a slash-menu action contributed by a block or plugin. */
export interface SlashItem {
  /** Stable action identity; block-generated items default to their type. */
  id?: string;
  /** Human-readable menu label. */
  title: string;
  /** Additional search terms. */
  aliases?: string[];
  /** Optional visual grouping label. */
  group?: string;
  /** Block type and initial data inserted by the default action. */
  block?: BlockInput;
  /** Custom action used instead of default block insertion. */
  run?: (editor: RivtoEditorApi, blockId: string) => void;
}

/** Slash-menu metadata attached to a registered block type. */
export type BlockSlashDefinition = Omit<SlashItem, "block" | "run">;

/** Current slash query owned by the plugin rather than a renderer. */
export interface SlashMenuState {
  /** Block containing the leading slash query. */
  blockId: string;
  /** Query text after the slash. */
  query: string;
}

/** Built-in plugin contract consumed by rendering adapters. */
export interface SlashMenuPlugin extends RivtoPlugin {
  /** Returns the current immutable plugin snapshot. */
  getState(): SlashMenuState | null;
  /** Subscribes a renderer to slash state changes. */
  subscribe(listener: () => void): () => void;
  /** Collects and filters block and plugin contributions for the current mode. */
  getItems(editor: RivtoEditorApi, query?: string): SlashItem[];
}

/** Returns the stable identity used by rendering and command payloads. */
export function slashItemId(item: SlashItem): string {
  return item.id ?? item.block?.type ?? `${item.group ?? ""}:${item.title}`;
}

/**
 * Builds slash-menu entries from registered block definitions.
 *
 * Filtering occurs before creating actions so a slash menu cannot insert a
 * type that `block.insert` would immediately reject in the current mode.
 */
export function collectBlockSlashItems(registry: BlockRegistry, mode?: EditorMode): SlashItem[] {
  return registry.listDefinitions().flatMap((definition) => definition.slash && (!mode || registry.supports(definition.type, mode))
    ? [{ id: definition.type, ...definition.slash, block: { type: definition.type } }]
    : []);
}

/**
 * Creates the global slash-menu interaction plugin.
 *
 * The plugin owns interaction state and policy while rendering adapters own
 * popup presentation. Selecting an item enters through `slash.execute`, so
 * even the default remove-and-insert behavior remains command-driven.
 */
export function createSlashMenuPlugin(): SlashMenuPlugin {
  let state: SlashMenuState | null = null;
  const listeners = new Set<() => void>();
  const setState = (next: SlashMenuState | null): void => {
    if (state?.blockId === next?.blockId && state?.query === next?.query) return;
    state = next;
    [...listeners].forEach((listener) => listener());
  };
  const getItems = (editor: RivtoEditorApi, query = ""): SlashItem[] => {
    const normalized = query.toLowerCase();
    return [
      ...collectBlockSlashItems(editor.blocks, editor.mode.get()),
      ...editor.plugins.getSlashItems(),
    ].filter((item) => [item.title, ...(item.aliases ?? [])]
      .some((term) => term.toLowerCase().includes(normalized)));
  };

  return {
    id: SLASH_MENU_PLUGIN_ID,
    events: {
      input: (event) => {
        const text = event.payload && typeof event.payload === "object"
          ? (event.payload as { text?: unknown }).text
          : undefined;
        if (!event.blockId || typeof text !== "string") return false;
        setState(text.startsWith("/") ? { blockId: event.blockId, query: text.slice(1) } : null);
        return false;
      },
      keydown: (event) => {
        if (!state || event.key !== "Escape") return false;
        setState(null);
        return true;
      },
    },
    commands: {
      "slash.close": () => setState(null),
      "slash.execute": (editor, value) => {
        if (!value || typeof value !== "object") throw new Error("slash.execute payload must be an object");
        const { blockId, itemId } = value as { blockId?: unknown; itemId?: unknown };
        if (typeof blockId !== "string" || typeof itemId !== "string") {
          throw new Error("slash.execute requires blockId and itemId");
        }
        const item = getItems(editor).find((candidate) => slashItemId(candidate) === itemId);
        if (!item) throw new Error(`Unknown slash item ${itemId}`);
        if (item.run) item.run(editor, blockId);
        else if (item.block) {
          const id = editor.commands.execute("block.insert", {
            block: { ...item.block, content: "" }, afterId: blockId,
          });
          editor.commands.execute("block.remove", { id: blockId });
          editor.focus(id);
        }
        setState(null);
      },
    },
    setup: (editor) => editor.subscribe(() => {
      if (state && !hasBlock(editor, state.blockId)) setState(null);
    }),
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getItems,
  };
}

/** Resolves the installed core plugin without exposing lookup casts to views. */
export function getSlashMenuPlugin(editor: RivtoEditorApi): SlashMenuPlugin | undefined {
  const plugin = editor.plugins.get(SLASH_MENU_PLUGIN_ID);
  return plugin && "getState" in plugin ? plugin as SlashMenuPlugin : undefined;
}
