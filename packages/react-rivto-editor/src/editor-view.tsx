import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EditorContext } from "./editor-context";
import { EditorRootContext } from "./editor-root-context";
import type { ReactEditor } from "./types";

/** Properties accepted by the React editor boundary. */
export interface EditorViewProps {
  /** React runtime created and destroyed by the host application. */
  readonly editor: ReactEditor;
  /** Optional application chrome; extensions are registered at runtime creation. */
  readonly children?: ReactNode;
}

/**
 * Provides one reactive editor runtime to a React subtree.
 *
 * EditorView is intentionally a provider rather than a renderer. It does not
 * create or destroy the editor, choose a page/canvas surface, traverse blocks,
 * or render a DOM wrapper. The host owns runtime lifetime and the child surface
 * owns presentation and registers its own DOM root through `useEditorRoot`.
 *
 * Core document changes use one global revision subscription. The focused
 * surface and extension subscriptions cover React-only registration changes.
 *
 * @param props - Editor runtime and React subtree to bind together.
 * @returns A context provider; EditorView adds no DOM element.
 */
export function EditorView({ editor, children }: EditorViewProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const subscribeEditor = useCallback(
    (listener: () => void) => editor.subscribe(listener),
    [editor],
  );
  useSyncExternalStore(
    subscribeEditor,
    () => editor.revision,
    () => editor.revision,
  );
  const subscribeSurfaces = useCallback(
    (listener: () => void) => editor.surfaces.subscribe(listener),
    [editor],
  );
  useSyncExternalStore(
    subscribeSurfaces,
    () => editor.surfaces.revision,
    () => editor.surfaces.revision,
  );
  const subscribeExtensions = useCallback(
    (listener: () => void) => editor.extensions.subscribe(listener),
    [editor],
  );
  useSyncExternalStore(
    subscribeExtensions,
    () => editor.extensions.revision,
    () => editor.extensions.revision,
  );
  const subscribeMode = useCallback(
    (listener: () => void) => editor.editor.mode.subscribe(listener),
    [editor],
  );
  const mode = useSyncExternalStore(
    subscribeMode,
    () => editor.editor.mode.get(),
    () => editor.editor.mode.get(),
  );

  const context = useMemo(() => ({ editor: editor.editor, reactEditor: editor }), [editor]);
  // The callback ref identity never changes, preventing React from unregistering
  // and registering the same surface root on ordinary editor renders.
  const rootRef = useCallback((element: HTMLElement | null) => {
    editor.events.setRoot(element);
    setRoot(element);
  }, [editor]);
  const rootContext = useMemo(() => ({ element: root, ref: rootRef }), [root, rootRef]);

  const Surface = editor.surfaces.get(mode);
  if (!Surface) throw new Error(`No React surface is registered for editor mode ${mode}`);
  const components = editor.extensions.getComponents();
  const editorWrappers = editor.surfaces.getEditorWrappers(mode);
  let content: ReactNode = (
    <>
      {children}
      {components.map((Component, index) => <Component key={`${Component.displayName ?? Component.name}-${index}`} />)}
      <Surface />
    </>
  );
  for (let index = editorWrappers.length - 1; index >= 0; index -= 1) {
    const EditorWrapper = editorWrappers[index]!;
    content = <EditorWrapper>{content}</EditorWrapper>;
  }

  return (
    <EditorContext.Provider value={context}>
      <EditorRootContext.Provider value={rootContext}>
        {content}
      </EditorRootContext.Provider>
    </EditorContext.Provider>
  );
}
