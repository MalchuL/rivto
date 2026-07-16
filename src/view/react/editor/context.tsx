import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { ViewPlugin } from "./types";

export interface ViewContextValue {
  editor: RivtoEditorApi;
  root: RefObject<HTMLDivElement | null>;
  plugins: readonly ViewPlugin[];
}

export const ViewContext = createContext<ViewContextValue | null>(null);

export function useViewContext(): ViewContextValue {
  const value = useContext(ViewContext);
  if (!value) throw new Error("Rivto view hooks must be used inside EditorView");
  return value;
}

export function useEditor(): RivtoEditorApi {
  return useViewContext().editor;
}

export function useEditorRoot(): RefObject<HTMLDivElement | null> {
  return useViewContext().root;
}

export function useEditorRevision(): number {
  const editor = useEditor();
  const subscribe = useCallback((listener: () => void) => editor.subscribe(listener), [editor]);
  return useSyncExternalStore(subscribe, () => editor.revision, () => editor.revision);
}

export function useEditorEvent<K extends keyof HTMLElementEventMap>(
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): void {
  const root = useEditorRoot();
  const current = useRef(handler);
  current.current = handler;
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const listener = (event: HTMLElementEventMap[K]) => current.current(event);
    element.addEventListener(type, listener as EventListener, options);
    return () => element.removeEventListener(type, listener as EventListener, options);
  }, [root, type, options]);
}
