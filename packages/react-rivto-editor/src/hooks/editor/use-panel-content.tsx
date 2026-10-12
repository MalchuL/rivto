import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import { BlockElementRefBoundary } from "../../blocks/block-wrapper/block-wrapper";
import { ChildrenPanel } from "../../panels/children-panel";
import { EmbeddingPanel } from "../../panels/embedding-panel";
import { DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN, PageVirtualizationContext } from "../../surfaces/page/page-virtualization-context";
import { EditorContext } from "../../components/editor-panel/editor-context";
import { EditorRootContext } from "../../components/editor-panel/editor-root-context";
import type { EditorPanelProps } from "../../components/editor-panel/types";

/**
 * Keeps host-supplied threshold and overscan counts safe for virtualizer index arithmetic.
 *
 * @param value - Requested count.
 * @param fallback - Default count for non-finite values.
 * @returns A nonnegative integer count.
 */
function normalizeVirtualizationCount(value: number, fallback: number): number {
  let count = fallback;
  if (Number.isFinite(value)) {
    count = Math.max(0, Math.trunc(value));
  }
  return count;
}

/**
 * Provides a document-backed editing panel using one shared reactive editor runtime.
 *
 * EditorPanel provides document context and renders the supplied surface and application UI.
 * It does not create or destroy the editor runtime, traverse blocks itself,
 * or add a DOM wrapper around a loaded surface. The host owns runtime lifetime
 * and the child surface owns presentation and registers its own DOM root through `useEditorRoot`.
 * Mounting registers only this panel’s local bindings and releases them on cleanup.
 * Even with EditorStorageContext, the caller retains the shared editor acquisition.
 * Nested occurrences share a document core while retaining independent event and UI state.
 * A deleted root replaces the supplied surface with a registered status region so
 * keyboard undo still reaches this document. Surface replacement transfers existing
 * focus within this panel without taking focus from another panel or host control.
 *
 * Document data uses focused block, root, and element subscriptions below this
 * boundary. Presentation and React registry subscriptions update only their owners, so
 * changing one block does not recreate the complete surface tree.
 *
 * @param props - Shared editor, panel roots and React subtree to bind together.
 * @param embedding - Includes and protects the block root instead of displaying its children.
 * @returns The panel's context providers and supplied surface, or a loading indicator before its model is available.
 */
export function usePanelContent({
  editor: hostEditor,
  onOpenBlock,
  mode,
  rootBlockId,
  rootElementId = null,
  active = true,
  onReady,
  children,
  virtualizePageThreshold = false,
  virtualizePageOverscan = DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN,
}: EditorPanelProps, embedding: boolean) {
  const openBlock = onOpenBlock;
  const documentId = hostEditor.document.getDocument().id;
  const parent = useContext(EditorContext);
  const enabled = active && parent?.enabled !== false;
  const instance = useMemo(() => {
    const options = { rootBlockId, rootElementId, openBlock, mode };
    if (embedding) {
      if (!rootBlockId) throw new Error("Embedding panel requires a block root");
      return new EmbeddingPanel(hostEditor, { ...options, rootBlockId });
    }
    return new ChildrenPanel(hostEditor, options);
  }, [hostEditor, rootBlockId, rootElementId, embedding, openBlock, mode]);
  useEffect(() => instance.mount(), [instance]);
  useLayoutEffect(() => instance.setEnabled(enabled), [instance, enabled]);
  const snapshot = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot);
  useEffect(() => {
    if (snapshot.retained && snapshot.document) onReady?.(snapshot.document);
  }, [snapshot.retained, snapshot.document, onReady]);
  const panel = snapshot.api;
  const domIdPrefix = useId();
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const subscribeSurfaces = useCallback(
    (listener: () => void) => hostEditor.surfaces.subscribe(listener),
    [hostEditor],
  );
  useSyncExternalStore(
    subscribeSurfaces,
    () => hostEditor.surfaces.revision,
    () => hostEditor.surfaces.revision,
  );
  const subscribeExtensions = useCallback(
    (listener: () => void) => hostEditor.extensions.subscribe(listener),
    [hostEditor],
  );
  useSyncExternalStore(
    subscribeExtensions,
    () => hostEditor.extensions.revision,
    () => hostEditor.extensions.revision,
  );
  const context = useMemo(() => panel ? ({ panel, documentId, document: snapshot.document, rootBlockId, domIdPrefix, enabled }) : null,
    [panel, documentId, snapshot.document, rootBlockId, domIdPrefix, instance, enabled]);
  const virtualization = useMemo(() => {
    let threshold = virtualizePageThreshold;
    if (typeof threshold === "number") {
      if (Number.isFinite(threshold)) threshold = normalizeVirtualizationCount(threshold, 0);
      else threshold = false;
    }
    return {
      threshold,
      overscan: normalizeVirtualizationCount(virtualizePageOverscan, DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN),
    };
  }, [virtualizePageThreshold, virtualizePageOverscan]);
  // The callback ref identity never changes, preventing React from unregistering
  // and registering the same surface root on ordinary editor renders.
  const restoreRootFocus = useRef(false);
  const rootRef = useCallback((element: HTMLElement | null) => {
    const previous = instance.getRoot();
    if (!element && previous) {
      restoreRootFocus.current = previous.contains(previous.ownerDocument.activeElement);
    }
    instance.setRoot(element);
    setRoot(element);
    if (element && restoreRootFocus.current) {
      restoreRootFocus.current = false;
      element.focus({ preventScroll: true });
    }
  }, [instance]);
  const rootContext = useMemo(() => ({ element: root, ref: rootRef }), [root, rootRef]);

  if (!context) {
    return <div role="status">Loading document…</div>;
  }

  // A deleted subtree still needs a registered keyboard root for its document's undo.
  // Transfer focus only from the replaced surface; other panels keep their focus.
  const content = snapshot.status === "missing"
    ? <div ref={rootRef} tabIndex={-1}><div role="status">Referenced block was deleted.</div></div>
    : children;

  return (
    <EditorContext.Provider value={context}>
      <PageVirtualizationContext.Provider value={virtualization}>
        <EditorRootContext.Provider value={rootContext}>
          <BlockElementRefBoundary>{content}</BlockElementRefBoundary>
        </EditorRootContext.Provider>
      </PageVirtualizationContext.Provider>
    </EditorContext.Provider>
  );
}
