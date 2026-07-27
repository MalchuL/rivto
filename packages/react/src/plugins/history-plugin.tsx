import { useEditor, useReactEditor } from "../hooks/editor/use-editor";
import { useDOMEvent } from "../hooks/editor/use-dom-event";
import { useKeyboardEvent } from "../hooks/editor/use-keyboard-event";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
} from "../managers";

/** One document-history action recognized from a browser editing event. */
type HistoryAction = "undo" | "redo";

/** Resolves history requests emitted directly by a contenteditable element. */
function inputHistoryAction(event: InputEvent): HistoryAction | undefined {
  if (event.inputType === "historyUndo") return "undo";
  if (event.inputType === "historyRedo") return "redo";
}

/**
 * Routes browser undo and redo gestures through the editor's CRDT history.
 *
 * A contenteditable normally owns a private DOM undo stack. Allowing that stack
 * to run would mutate rendered text first, after which `onInput` would record
 * the browser's old DOM as a new collaborative edit. This plugin prevents that
 * native operation and invokes `editor.undo()` or `editor.redo()` instead.
 *
 * Keyboard shortcuts are handled on `keydown`. The separate `beforeinput`
 * listener covers browser or operating-system editing commands that arrive as
 * `historyUndo`/`historyRedo` without a corresponding key event. Preventing the
 * keydown normally suppresses its later beforeinput event, so one shortcut
 * produces one history action.
 *
 * History updates the runtime synchronously, but React may need another frame
 * to reconcile editable DOM nodes. Focus restoration is therefore deferred:
 * text selections are rebuilt from block-relative offsets, while structural or
 * empty selections focus the registered surface root and clear native ranges.
 *
 * Mount the plugin once inside `EditorView`. Its listeners are scoped to the
 * active surface root and automatically removed by `useDOMEvent`.
 *
 * @example
 * ```tsx
 * <EditorView editor={editor}>
 *   <HistoryPlugin />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export interface HistoryPluginProps {
  /** Exact shortcuts routed to editor undo; an empty array disables keydown undo. */
  readonly undoKeys?: readonly string[];
  /** Exact shortcuts routed to editor redo; an empty array disables keydown redo. */
  readonly redoKeys?: readonly string[];
}

export function HistoryPlugin(options: HistoryPluginProps = {}) {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const { element: root } = useEditorRoot();

  /** Executes one history step and restores focus after React renders it. */
  const run = (action: HistoryAction): void => {
    if (!root) return;
    editor[action]();
    requestAnimationFrame(() => {
      if (reactEditor.selection.restoreDOM()) return;
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
    });
  };

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.historyUndo,
    keys: options.undoKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.historyUndo]!,
    composing: "prevent",
  }, () => {
    run("undo");
    return true;
  });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.historyRedo,
    keys: options.redoKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.historyRedo]!,
    composing: "prevent",
  }, () => {
    run("redo");
    return true;
  });

  useDOMEvent("beforeinput", ({ event }) => {
    const action = inputHistoryAction(event);
    if (!action) return false;

    if (!event.isComposing) run(action);
    return true;
  });

  return null;
}
