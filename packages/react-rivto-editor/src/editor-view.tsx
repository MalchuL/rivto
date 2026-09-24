import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EditorContext } from "./editor-context";
import { EditorRootContext } from "./editor-root-context";
import { DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN, PageVirtualizationContext } from "./page-virtualization-context";
import type { ReactEditor } from "./types";

/** Properties accepted by the React editor boundary. */
export interface EditorViewProps {
  /** React runtime created and destroyed by the host application. */
  readonly reactEditor: ReactEditor;
  /** Optional application chrome; extensions are registered at runtime creation. */
  readonly children?: ReactNode;
  /** False disables page virtualization, true always enables it, and a number sets the minimum root count; defaults to false. */
  readonly virtualizePageThreshold?: boolean | number;
  /** Extra mounted roots on each side of the viewport; defaults to 8. */
  readonly virtualizePageOverscan?: number;
}

/**
 * Keeps host-supplied root counts safe for the virtualizer's index arithmetic.
 *
 * @param value - Requested count.
 * @param fallback - Default count for non-finite values.
 * @returns A nonnegative integer count.
 */
function rootCount(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

/**
 * Provides one reactive editor runtime to a React subtree.
 *
 * EditorView is intentionally a provider rather than a renderer. It does not
 * create or destroy the editor, choose a page/canvas surface, traverse blocks,
 * or render a DOM wrapper. The host owns runtime lifetime and the child surface
 * owns presentation and registers its own DOM root through `useEditorRoot`.
 *
 * Document data uses focused block, root, and element subscriptions below this
 * boundary. Mode and React registry subscriptions update only their owners, so
 * changing one block does not recreate the complete surface tree.
 *
 * @param props - Editor runtime and React subtree to bind together.
 * @returns A context provider; EditorView adds no DOM element.
 */
export function EditorView({
  reactEditor,
  children,
  virtualizePageThreshold = false,
  virtualizePageOverscan = DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN,
}: EditorViewProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const subscribeSurfaces = useCallback(
    (listener: () => void) => reactEditor.surfaces.subscribe(listener),
    [reactEditor],
  );
  useSyncExternalStore(
    subscribeSurfaces,
    () => reactEditor.surfaces.revision,
    () => reactEditor.surfaces.revision,
  );
  const subscribeExtensions = useCallback(
    (listener: () => void) => reactEditor.extensions.subscribe(listener),
    [reactEditor],
  );
  useSyncExternalStore(
    subscribeExtensions,
    () => reactEditor.extensions.revision,
    () => reactEditor.extensions.revision,
  );
  const subscribeMode = useCallback(
    (listener: () => void) => reactEditor.mode.subscribe(listener),
    [reactEditor],
  );
  const mode = useSyncExternalStore(
    subscribeMode,
    () => reactEditor.mode.get(),
    () => reactEditor.mode.get(),
  );

  const context = useMemo(() => ({ reactEditor }), [reactEditor]);
  const virtualization = useMemo(() => {
    let threshold = virtualizePageThreshold;
    if (typeof threshold === "number") {
      if (Number.isFinite(threshold)) threshold = rootCount(threshold, 0);
      else threshold = false;
    }
    return {
      threshold,
      overscan: rootCount(virtualizePageOverscan, DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN),
    };
  }, [virtualizePageThreshold, virtualizePageOverscan]);
  // The callback ref identity never changes, preventing React from unregistering
  // and registering the same surface root on ordinary editor renders.
  const rootRef = useCallback((element: HTMLElement | null) => {
    reactEditor.events.setRoot(element);
    setRoot(element);
  }, [reactEditor]);
  const rootContext = useMemo(() => ({ element: root, ref: rootRef }), [root, rootRef]);

  const Surface = reactEditor.surfaces.get(mode);
  if (!Surface) throw new Error(`No React surface is registered for editor mode ${mode}`);
  const beforeSurface = reactEditor.extensions.getComponents("beforeSurface");
  const afterSurface = reactEditor.extensions.getComponents("afterSurface");
  const editorWrappers = reactEditor.surfaces.getEditorWrappers(mode);
  let content: ReactNode = (
    <>
      {children}
      {beforeSurface.map((Component, index) => (
        <Component key={`before-${Component.displayName ?? Component.name}-${index}`} />
      ))}
      <Surface />
      {afterSurface.map((Component, index) => (
        <Component key={`after-${Component.displayName ?? Component.name}-${index}`} />
      ))}
    </>
  );
  for (let index = editorWrappers.length - 1; index >= 0; index -= 1) {
    const EditorWrapper = editorWrappers[index]!;
    content = <EditorWrapper>{content}</EditorWrapper>;
  }

  return (
    <EditorContext.Provider value={context}>
      <PageVirtualizationContext.Provider value={virtualization}>
        <EditorRootContext.Provider value={rootContext}>
          {content}
        </EditorRootContext.Provider>
      </PageVirtualizationContext.Provider>
    </EditorContext.Provider>
  );
}
