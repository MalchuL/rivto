import { ReactPanel } from "../../panels/react-panel";
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
import type { PanelAPI, PanelOptions } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";
import { DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN, PageVirtualizationContext } from "../../surfaces/page/page-virtualization-context";
import { ReactPanelContext } from "./react-panel-context";
import { EditorRootContext } from "./editor-root-context";
import type { PanelSnapshot } from "../../panels/types";
import type { EditorPanelProps } from "./types";

/** Internal provider properties with the core panel factory supplied by its owning component. */
interface ReactPanelProviderProps extends EditorPanelProps {
  /** Creates core panel boundaries after commit; keep this factory stable across renders. */
  readonly createPanel: (editor: ReactEditorApi, options: PanelOptions) => PanelAPI;
}

const LOADING_PANEL_SNAPSHOT: PanelSnapshot = { status: "loading" };

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
 * This component creates and connects the panel in an effect after commit and destroys
 * it on cleanup; React callers must not create ReactPanel instances manually.
 * Abandoned renders create no panel, and StrictMode effect replay creates a new
 * instance after destroying the old one. The first client render and SSR show
 * loading until the effect supplies a panel. Mounting registers only this panel’s
 * local bindings and releases them on cleanup.
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
 * The panel factory defines block boundaries and whether the block root is included and protected.
 * @returns The panel's context providers and supplied surface, or a loading indicator before its panel instance is available.
 */
export function ReactPanelProvider({
  createPanel,
  editor: hostEditor,
  mode,
  rootBlockId,
  rootElementId = null,
  active = true,
  onReady,
  children,
  virtualizePageThreshold = false,
  virtualizePageOverscan = DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN,
}: ReactPanelProviderProps) {
  const documentId = hostEditor.getDocument().id;
  const parent = useContext(ReactPanelContext);
  const enabled = active && parent?.enabled !== false;
  const configuration = useMemo(() => ({ hostEditor, rootBlockId, rootElementId, createPanel, mode }),
    [hostEditor, rootBlockId, rootElementId, createPanel, mode]);
  const [current, setCurrent] = useState<{ configuration: typeof configuration; instance: ReactPanel }>();
  useEffect(() => {
    const { hostEditor, rootBlockId, rootElementId, createPanel, mode } = configuration;
    const corePanel = createPanel(hostEditor, { rootBlockId, rootElementId });
    const instance = new ReactPanel(hostEditor, corePanel, { mode });
    setCurrent({ configuration, instance });
    return instance.destroy;
  }, [configuration]);
  // A changed editor or root must not render children against the previous panel before its replacement effect runs.
  const instance = current?.configuration === configuration ? current.instance : undefined;
  useLayoutEffect(() => instance?.setEnabled(enabled), [instance, enabled]);
  const subscribeAvailability = useCallback((listener: () => void) => {
    if (!instance) return () => {};
    return instance.subscribeAvailability(listener);
  }, [instance]);
  const getSnapshot = useCallback(() => instance?.getSnapshot() ?? LOADING_PANEL_SNAPSHOT, [instance]);
  const snapshot = useSyncExternalStore(subscribeAvailability, getSnapshot, getSnapshot);
  useEffect(() => {
    if (snapshot.retained && snapshot.document) onReady?.(snapshot.document);
  }, [snapshot.retained, snapshot.document, onReady]);
  const reactPanel = snapshot.api;
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
  const panelContextValue = useMemo(() => reactPanel ? ({ reactPanel, documentId, document: snapshot.document, rootBlockId, domIdPrefix, enabled }) : null,
    [reactPanel, documentId, snapshot.document, rootBlockId, domIdPrefix, instance, enabled]);
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
    const previous = instance?.getRoot();
    if (!element && previous) {
      restoreRootFocus.current = previous.contains(previous.ownerDocument.activeElement);
    }
    instance?.setRoot(element);
    setRoot(element);
    if (element && restoreRootFocus.current) {
      restoreRootFocus.current = false;
      element.focus({ preventScroll: true });
    }
  }, [instance]);
  const rootContext = useMemo(() => ({ element: root, ref: rootRef }), [root, rootRef]);

  if (!panelContextValue) {
    return <div role="status">Loading document…</div>;
  }

  // A deleted subtree still needs a registered keyboard root for its document's undo.
  // Transfer focus only from the replaced surface; other panels keep their focus.
  const content = snapshot.status === "missing"
    ? <div ref={rootRef} tabIndex={-1}><div role="status">Referenced block was deleted.</div></div>
    : children;

  return (
    <ReactPanelContext.Provider value={panelContextValue}>
      <PageVirtualizationContext.Provider value={virtualization}>
        <EditorRootContext.Provider value={rootContext}>
          <BlockElementRefBoundary>{content}</BlockElementRefBoundary>
        </EditorRootContext.Provider>
      </PageVirtualizationContext.Provider>
    </ReactPanelContext.Provider>
  );
}
