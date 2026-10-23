import { CanvasViewport } from "../browser/canvas-viewport";
import { CanvasViewportContext } from "./canvas-viewport-context";
import type { CanvasApi } from "../core/canvas";
import type { CanvasEditor } from "../core/canvas-editor";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CanvasToolSession } from "../types/tool-session";
import type { CanvasTool } from "../core/tools/canvas-tool";

/** View access to scene identity and tools; session attachment belongs to the provider. */
export interface CanvasEditorViewApi {
  readonly canvas: CanvasApi;
  readonly tools: Pick<CanvasToolSession, "active" | "revision" | "subscribe" | "reset">;
}

/** Provider-owned editor and its descendants. */
export interface CanvasEditorProviderProps {
  readonly editor: CanvasEditor;
  readonly children: ReactNode;
}

const EditorContext = createContext<CanvasEditorViewApi | null>(null);

/**
 * Connects one editor to its source and tools for the mounted React subtree.
 *
 * Settings and factories belong to the supplied editor. Cleanup releases source
 * subscriptions and live instances; remount retains the editor and its settings.
 *
 * @param props - Editor and children sharing its scene and active tool.
 * @returns Context for views and application controls, without adding DOM.
 */
export function CanvasEditorProvider({ editor, children }: CanvasEditorProviderProps) {
  const viewport = useMemo(() => new CanvasViewport(editor.canvas), [editor]);
  useEffect(() => editor.connect(), [editor]);
  return (
    <EditorContext.Provider value={editor}>
      <CanvasViewportContext.Provider value={viewport}>{children}</CanvasViewportContext.Provider>
    </EditorContext.Provider>
  );
}

/**
 * Reads the receiving canvas session without creating tool state.
 *
 * @returns The shared session, or null outside its provider.
 */
export function useCanvasTools(): CanvasEditorViewApi["tools"] | null {
  return useCanvasEditor()?.tools ?? null;
}

/**
 * Observes tool activation without subscribing to high-frequency preview samples.
 *
 * @param tools - Surface-local session, or null when no tools are installed.
 * @returns Active tool, or undefined when the session has no available fallback.
 */
export function useActiveCanvasTool(
  tools: Pick<CanvasToolSession, "active" | "revision" | "subscribe"> | null,
): CanvasTool | undefined {
  useSyncExternalStore(
    (listener) => tools?.subscribe(listener) ?? (() => {}),
    () => tools?.revision ?? 0,
    () => tools?.revision ?? 0,
  );
  return tools?.active;
}

/**
 * Reads the independently constructed editor serving this React subtree.
 *
 * @returns The receiving editor, or null outside CanvasEditorProvider.
 */
export function useCanvasEditor(): CanvasEditorViewApi | null {
  return useContext(EditorContext);
}
