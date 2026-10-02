/**
 * Product document editor backed by Rivto.
 *
 * Mirrors the demo host: `createRivtoEditor` + `createReactEditor` +
 * `standardPreset` + `edgelessVisualsExtension`, rendered through `EditorView`.
 * The adapter owns runtime lifetime and writes `editor.dump()` JSON back to
 * the page store. Surfaces stay inside the app chrome; page-surface card
 * styles are flattened in `styles.css`.
 */

"use client";

import "@chulane/rivto-react/styles.css";
import { EditorView } from "@chulane/rivto-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { createPageEditor, type PageEditorRuntime } from "./create-page-editor";
import { EditorModeToggle } from "./editor-mode-toggle";
import type { DocumentEditorProps } from "./editor-types";
import { serializeEditorSnapshot } from "./snapshot";

export { EditorModeToggle } from "./editor-mode-toggle";

const EDITOR_ROOT_CLASS = "rivto-app-editor";
const TOOLBAR_CLASS = "rivto-app-editor-toolbar";

/**
 * Rivto document surface for one persisted page.
 *
 * Created on the client so Next.js SSR never touches Yjs or `window`. The
 * runtime is recreated when `documentId` or `initialMode` changes; parents
 * should not pass a new `content` identity on every local save.
 *
 * @param props - Page identity, snapshot JSON, and persistence callback.
 * @returns Editor chrome and the active Rivto surface, or nothing until mount.
 */
export function RivtoEditor({
  documentId,
  content,
  onChange,
  className,
  initialMode = "block",
  children,
  showModeSwitch = true,
}: DocumentEditorProps) {
  const [runtime, setRuntime] = useState<PageEditorRuntime | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef(content);

  useEffect(() => {
    const created = createPageEditor({ snapshot: content, mode: initialMode });
    lastEmitted.current = serializeEditorSnapshot(created.editor.dump());
    const unsubscribe = created.editor.subscribe(() => {
      const next = serializeEditorSnapshot(created.editor.dump());
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChangeRef.current(next);
    });
    setRuntime(created);
    return () => {
      unsubscribe();
      created.reactEditor.destroy();
      created.editor.destroy();
      setRuntime(null);
    };
    // `content` is the hydration payload for this document, not a live prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount via documentId
  }, [documentId, initialMode]);

  if (!runtime) {
    return <div className={cn(EDITOR_ROOT_CLASS, className)} />;
  }

  return (
    <div className={cn(EDITOR_ROOT_CLASS, className)}>
      <EditorView editor={runtime.reactEditor}>
        {children}
        {showModeSwitch ? (
          <header className={TOOLBAR_CLASS}>
            <EditorModeToggle />
          </header>
        ) : null}
      </EditorView>
    </div>
  );
}

/** Product document editor. Replaces the TipTap stage-1 adapter. */
export const DocumentEditor = RivtoEditor;
