import { createElement, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorPosition, RivtoEditorApi } from "../../editor";
import { RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import {
  clearCrossBlockHighlight,
  clearNativeSelection,
  readDOMPointPosition,
  readDOMSelectionPoint,
  readEditorSelection,
  restoreEditorSelection,
  setNativeSelection,
  updateCrossBlockHighlight,
  type DOMSelectionPoint,
} from "../blocks/selection";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceRegistry } from "../managers/surface-registry";
import { RIVTO_EDITOR_ROOT_ATTR, RIVTO_POINTER_SELECTING_ATTR, RIVTO_SURFACE_ATTR } from "./dom";

/** Properties for the top-level React editor view connector. */
export interface EditorViewProps {
  /** Long-lived editor runtime owned by the host application. */
  readonly editor: RivtoEditorApi;
  /** Registered document-level surface components. */
  readonly surfaces: SurfaceRegistry;
  /** Registered block-level renderer components. */
  readonly renderers: BlockRendererRegistry;
}

function sameTextSelection(root: HTMLElement, selection: ReturnType<RivtoEditorApi["selection"]["get"]>): boolean {
  if (!selection || selection.type !== "text") return false;
  const native = readEditorSelection(root);
  return Boolean(native
    && native.anchor.blockId === selection.anchor.blockId
    && native.anchor.offset === selection.anchor.offset
    && native.head.blockId === selection.head.blockId
    && native.head.offset === selection.head.offset);
}

interface PointerTextSelection {
  anchor: DOMSelectionPoint;
  anchorPosition: EditorPosition;
  synthetic: boolean;
}

/**
 * Connects the editor runtime to registered React surface components.
 *
 * The component owns subscription to editor revisions. Surface and block
 * rendering stay delegated to their registries.
 */
export function EditorView({ editor, surfaces, renderers }: EditorViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const pointerSelection = useRef<PointerTextSelection | null>(null);
  useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.revision,
    () => editor.revision,
  );
  const selectionRevision = useSyncExternalStore(
    (listener) => editor.selection.subscribe(listener),
    () => JSON.stringify(editor.selection.get()),
    () => "null",
  );

  useEffect(() => {
    const synchronizeSelection = (): void => {
      if (!root.current) return;
      if (root.current.hasAttribute(RIVTO_POINTER_SELECTING_ATTR)) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    document.addEventListener("selectionchange", synchronizeSelection);
    return () => document.removeEventListener("selectionchange", synchronizeSelection);
  }, [editor]);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!root.current || !pointerSelection.current) return;
      const head = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
      if (!head) return;
      if (head.content === pointerSelection.current.anchor.content) return;
      pointerSelection.current.synthetic = true;
      root.current.setAttribute(RIVTO_POINTER_SELECTING_ATTR, "true");
      setNativeSelection(pointerSelection.current.anchor, head);
      const headPosition = readDOMPointPosition(root.current, head);
      if (!headPosition) return;
      editor.execute("selection.set", {
        selection: {
          type: "text",
          anchor: pointerSelection.current.anchorPosition,
          head: headPosition,
        },
      });
    };
    const stop = (): void => {
      const synthetic = pointerSelection.current?.synthetic ?? false;
      if (root.current) root.current.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
      pointerSelection.current = null;
      if (synthetic || !root.current) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    window.addEventListener("pointermove", move, { passive: false, capture: true });
    window.addEventListener("pointerup", stop, true);
    return () => {
      if (root.current) root.current.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
    };
  }, [editor]);

  const surfaceType = editor.mode.get();

  useLayoutEffect(() => {
    if (!root.current) return undefined;
    const selection = editor.selection.get();
    const activeContent = document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
      : null;
    if (selection?.type === "text") {
      if (!activeContent || !root.current.contains(activeContent)) {
        if (!sameTextSelection(root.current, selection)) restoreEditorSelection(root.current, selection);
      }
      updateCrossBlockHighlight(root.current, selection);
    } else {
      clearNativeSelection(root.current);
      updateCrossBlockHighlight(root.current, selection);
    }
    return () => {
      if (root.current) clearCrossBlockHighlight(root.current);
    };
  }, [editor, selectionRevision, surfaceType]);

  const surface = surfaces.get(surfaceType);
  if (!surface) return null;

  return createElement(
    "div",
    {
      ref: root,
      [RIVTO_EDITOR_ROOT_ATTR]: "",
      [RIVTO_SURFACE_ATTR]: surfaceType,
      onPointerDownCapture(event: ReactPointerEvent) {
        if (event.button !== 0 || !root.current) return;
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
          : null;
        if (!target || !root.current.contains(target)) return;
        const anchor = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
        const anchorPosition = anchor ? readDOMPointPosition(root.current, anchor) : undefined;
        pointerSelection.current = anchor && anchorPosition ? { anchor, anchorPosition, synthetic: false } : null;
      },
    },
    createElement(surface.component, {
      editor,
      renderers,
    }),
  );
}
