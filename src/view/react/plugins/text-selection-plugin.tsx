import {
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type {
  EditorPosition,
  EditorSelection,
} from "../../../editor";
import { BLOCK_CONTENT_SELECTOR } from "../constants";
import { useEditor } from "../hooks/editor/use-editor";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import {
  clearTextSelectionHighlight,
  createDOMSelectionItems,
  readDOMPointPosition,
  readDOMSelectionPoint,
  readEditorDOMSelection,
  setNativeSelection,
  updateTextSelectionHighlight,
  type DOMSelectionPoint,
} from "../hooks/utils/editor-dom-selection";

/** Live state retained only for the duration of one pointer selection gesture. */
interface PointerSelection {
  /** Pointer-down viewport position used to ignore accidental tiny movement. */
  readonly startX: number;
  readonly startY: number;
  /** Native and portable forms of the fixed pointer-down endpoint. */
  readonly anchor: DOMSelectionPoint;
  readonly anchorPosition: EditorPosition;
  /** True after movement crosses into another editable block host. */
  crossBlock: boolean;
  /** Latest moving endpoint, used to restore direction after pointer-up. */
  head?: DOMSelectionPoint;
  /** Latest portable list published to SelectionManager. */
  selection?: EditorSelection;
}

/** Returns true when a pointer event began inside editable block content. */
function isEditableTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const content = target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  return Boolean(content && root.contains(content));
}

/**
 * Synchronizes directed browser text selection with the editor selection list.
 *
 * Every block owns a separate contenteditable element. Browsers handle a drag
 * inside one element natively, but Chromium may collapse or reverse a range as
 * the pointer crosses into another editing host. This plugin keeps the original
 * pointer-down endpoint, resolves subsequent pointer coordinates itself, and
 * uses `Selection.setBaseAndExtent` to display the correct directed range.
 *
 * Runtime state contains one directed TextSelection for the exact endpoints.
 * Fully covered blocks between those endpoints are also emitted as one
 * BlockSelection item. Copy and cut can therefore distinguish partial boundary
 * text from whole intermediate blocks while forward and reverse gestures retain
 * their real anchor/focus direction.
 *
 * The plugin renders no UI and assumes no surface classes. It relies only on
 * the stable data attributes provided by BlockView and useBlockTextEditing.
 * Mount it once inside EditorView, alongside the active surface.
 *
 * @example
 * ```tsx
 * <EditorView editor={editor}>
 *   <TextSelectionPlugin />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function TextSelectionPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();
  const pointer = useRef<PointerSelection | null>(null);
  const currentSelection = editor.selection.get();

  // Repaint after document commands, remote changes, or clipboard operations.
  // It does not restore focus or the native range, so toolbar clicks remain safe.
  useLayoutEffect(() => {
    if (root) updateTextSelectionHighlight(root, currentSelection);
  }, [currentSelection, root]);

  useEffect(() => {
    if (!root) return;
    const document = root.ownerDocument;
    const window = document.defaultView;
    if (!window) return;
    let releaseTimer: number | undefined;
    let ownsCrossBlockSelection = false;

    /** Saves a stable pointer-down endpoint before native selection starts. */
    const start = (event: PointerEvent): void => {
      if (event.button !== 0 || !isEditableTarget(root, event.target)) return;
      if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
      ownsCrossBlockSelection = false;
      const anchor = readDOMSelectionPoint(root, event.clientX, event.clientY);
      const anchorPosition = anchor && readDOMPointPosition(root, anchor);
      pointer.current = anchor && anchorPosition ? {
        startX: event.clientX,
        startY: event.clientY,
        anchor,
        anchorPosition,
        crossBlock: false,
      } : null;
    };

    /** Bridges selection only after the pointer enters a different block host. */
    const move = (event: PointerEvent): void => {
      const active = pointer.current;
      if (!active || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return;

      const head = readDOMSelectionPoint(root, event.clientX, event.clientY);
      const headPosition = head && readDOMPointPosition(root, head);
      if (!head || !headPosition || headPosition.blockId === active.anchorPosition.blockId) return;

      // Native contenteditable selection owns same-block dragging. Once the
      // gesture crosses hosts, preventing its default movement avoids Chromium
      // replacing our original endpoint with a collapsed range in the new host.
      event.preventDefault();
      active.crossBlock = true;
      ownsCrossBlockSelection = true;
      active.head = head;
      active.selection = createDOMSelectionItems(root, active.anchorPosition, headPosition);
      editor.execute("selection.set", { selection: active.selection });
      setNativeSelection(active.anchor, head);
      updateTextSelectionHighlight(root, active.selection);
    };

    /** Restores the final directed native range, then releases pointer ownership. */
    const stop = (): void => {
      const completed = pointer.current;
      pointer.current = null;
      if (!completed?.crossBlock || !completed.head || !completed.selection) return;

      setNativeSelection(completed.anchor, completed.head);
      updateTextSelectionHighlight(root, completed.selection);

      // Firefox and Chromium can emit one delayed selectionchange after
      // pointer-up. Keep the synthetic result authoritative through that task.
      releaseTimer = window.setTimeout(() => {
        setNativeSelection(completed.anchor, completed.head!);
        updateTextSelectionHighlight(root, completed.selection!);
        ownsCrossBlockSelection = false;
      });
    };

    /** Mirrors ordinary native caret and same-host selection changes. */
    const synchronize = (): void => {
      if (ownsCrossBlockSelection) return;
      const selection = readEditorDOMSelection(root);
      if (selection) {
        editor.execute("selection.set", { selection });
        updateTextSelectionHighlight(root, selection);
        return;
      }

      // Losing the browser range clears only text items. A separate block or
      // edgeless selection remains valid local state.
      const current = editor.selection.get();
      const remaining = current.filter((item) => item.type !== "text");
      if (remaining.length !== current.length) editor.execute("selection.set", { selection: remaining });
      clearTextSelectionHighlight(root);
    };

    root.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    document.addEventListener("selectionchange", synchronize);

    return () => {
      if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
      ownsCrossBlockSelection = false;
      pointer.current = null;
      root.removeEventListener("pointerdown", start);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      document.removeEventListener("selectionchange", synchronize);
      clearTextSelectionHighlight(root);
    };
  }, [editor, root]);

  return null;
}
