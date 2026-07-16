import { createElement, useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { RIVTO_EDITOR_ROOT_ATTR, RIVTO_SURFACE_ATTR } from "./dom";
import { ViewContext } from "./context";
import type { EditorViewProps } from "./types";

/**
 * Connects the editor runtime to registered React surface components.
 *
 * The component owns only subscription to editor revisions, surface selection,
 * root DOM markers, and bridge mounting. Surface and block rendering are
 * delegated to their registries.
 */
export function EditorView({ editor, plugins = [], children }: EditorViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((listener: () => void) => editor.subscribe(listener), [editor]);
  useSyncExternalStore(subscribe, () => editor.revision, () => editor.revision);
  const value = useMemo(() => ({ editor, root, plugins }), [editor, plugins]);
  const ids = new Set<string>();
  plugins.forEach(({ id }) => {
    if (!id || ids.has(id)) throw new Error(`Duplicate or empty view plugin id: ${id}`);
    ids.add(id);
  });
  const content = [...plugins].reverse().reduce<ReactNode>((child, plugin) => (
    plugin.View ? createElement(plugin.View, null, child) : child
  ), children);

  return createElement(ViewContext.Provider, { value }, createElement("div", {
    ref: root,
    [RIVTO_EDITOR_ROOT_ATTR]: "",
    [RIVTO_SURFACE_ATTR]: editor.mode.get(),
  }, content));
}

export type { EditorViewProps } from "./types";
