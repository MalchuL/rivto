import type { DocumentModel } from "@chulane/document-model";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BlockElementRefBoundary } from "../blocks/block-wrapper/block-wrapper";
import type { EditorRuntime } from "../editor/editor-runtime";
import { EditorStorageContext } from "../editor/editor-storage-context";
import { EditorContext } from "./editor-context";
import { EditorRootContext } from "./editor-root-context";
import { EditorViewController } from "./editor-view-controller";
import { DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN, PageVirtualizationContext } from "./page-virtualization-context";

/** Properties accepted by the React editor boundary. */
export interface EditorViewProps {
  /** React runtime created and destroyed by the host application. */
  readonly runtime: EditorRuntime;
  /** Optional block and descendants to display instead of the complete document. */
  readonly rootBlockId?: string;
  /** False suspends hidden-tab interaction while keeping its document acquired; defaults to true. */
  readonly active?: boolean;
  /** Notifies the host after this view acquires its model; does not transfer the view's release handle. */
  readonly onReady?: (document: DocumentModel) => void;
  /** Explicit PageSurface or EdgelessSurface, plus optional application chrome; extensions are registered at runtime creation. */
  readonly children?: ReactNode;
  /** False disables page virtualization, true always enables it, and a number sets the minimum root count; defaults to false. */
  readonly virtualizePageThreshold?: boolean | number;
  /** Extra mounted roots on each side of the viewport; defaults to 8. */
  readonly virtualizePageOverscan?: number;
}

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
 * Provides a document-backed editing view using one shared reactive editor runtime.
 *
 * EditorView provides document context and renders the supplied surface and application UI.
 * It does not create or destroy the editor runtime, traverse blocks itself,
 * or add a DOM wrapper around a loaded surface. The host owns runtime lifetime
 * and the child surface owns presentation and registers its own DOM root through `useEditorRoot`.
 * With EditorStorageContext, the view acquires its registered document on commit
 * and releases it on cleanup; without storage the caller retains ownership.
 * Nested occurrences share a document core while retaining independent event and UI state.
 *
 * Document data uses focused block, root, and element subscriptions below this
 * boundary. Presentation and React registry subscriptions update only their owners, so
 * changing one block does not recreate the complete surface tree.
 *
 * @param props - Editor runtime and React subtree to bind together.
 * @returns The view's context providers and supplied surface, or a loading/error indicator before its model is available.
 */
export function EditorView({
  runtime: hostEditor,
  rootBlockId,
  active = true,
  onReady,
  children,
  virtualizePageThreshold = false,
  virtualizePageOverscan = DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN,
}: EditorViewProps) {
  const documentId = hostEditor.getDocument().id;
  const parent = useContext(EditorContext);
  const storage = useContext(EditorStorageContext);
  const enabled = active && parent?.enabled !== false;
  const controller = useMemo(() => new EditorViewController(hostEditor, rootBlockId, storage), [hostEditor, rootBlockId, storage]);
  useEffect(() => controller.mount(), [controller]);
  useLayoutEffect(() => controller.setEnabled(enabled), [controller, enabled]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (snapshot.retained && snapshot.document) onReady?.(snapshot.document);
  }, [snapshot.retained, snapshot.document, onReady]);
  const editorView = snapshot.api;
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
  const context = useMemo(() => editorView ? ({ editorView, documentId, document: snapshot.document, rootBlockId, domIdPrefix, enabled }) : null,
    [editorView, documentId, snapshot.document, rootBlockId, domIdPrefix, controller, enabled]);
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
  const rootRef = useCallback((element: HTMLElement | null) => {
    controller.setRoot(element);
    setRoot(element);
  }, [controller]);
  const rootContext = useMemo(() => ({ element: root, ref: rootRef }), [root, rootRef]);

  if (!context) {
    return <div role="status">{snapshot.status === "error" ? "Unable to load document." : "Loading document…"}</div>;
  }

  const content = <>{children}{snapshot.status === "missing" && <div role="status">Referenced block was deleted.</div>}</>;

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
