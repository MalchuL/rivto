import { useEditor } from "../hooks/editor/use-editor";
import { useEditorEvent } from "../hooks/editor/use-editor-event";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import { restoreEditorDOMSelection } from "../hooks/utils/editor-dom-selection";
import { shortcutFromKeyboardEvent } from "../keyboard-events";

/** One document-history action recognized from a browser editing event. */
type HistoryAction = "undo" | "redo";

/** Resolves the portable editor history shortcuts without platform sniffing. */
function keyboardHistoryAction(event: KeyboardEvent, options: HistoryPluginProps): HistoryAction | undefined {
  const shortcut = shortcutFromKeyboardEvent(event);
  if ((options.undoKeys ?? ["Primary+z"]).includes(shortcut)) return "undo";
  if ((options.redoKeys ?? ["Primary+Shift+z", "Primary+y"]).includes(shortcut)) return "redo";
}

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
 * active surface root and automatically removed by `useEditorEvent`.
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
  const { element: root } = useEditorRoot();

  /** Executes one history step and restores focus after React renders it. */
  const run = (action: HistoryAction): void => {
    if (!root) return;
    editor[action]();
    requestAnimationFrame(() => {
      const selection = editor.selection.get();
      if (restoreEditorDOMSelection(root, selection)) return;
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
    });
  };

  useEditorEvent("keydown", (event) => {
    if (event.defaultPrevented) return;
    const action = keyboardHistoryAction(event, options);
    if (!action) return;

    // Even while an IME owns text input, never let the contenteditable's local
    // undo stack diverge from collaborative history. The editor action itself
    // waits until composition has finished.
    event.preventDefault();
    if (!event.isComposing) run(action);
  });

  useEditorEvent("beforeinput", (event) => {
    if (event.defaultPrevented) return;
    const action = inputHistoryAction(event);
    if (!action) return;

    event.preventDefault();
    if (!event.isComposing) run(action);
  });

  return null;
}
