import type { ReactEditor } from "../types";
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
 * the browser's old DOM as a new collaborative edit. This extension prevents that
 * native operation and invokes `editor.undo()` or `editor.redo()` instead.
 *
 * Keyboard shortcuts are handled on `keydown`. The separate `beforeinput`
 * listener covers browser or operating-system editing commands that arrive as
 * `historyUndo`/`historyRedo` without a corresponding key event. Preventing the
 * keydown normally suppresses its later beforeinput event, so one shortcut
 * produces one history action.
 *
 * Known host limitation: Cursor's built-in Browser can intercept Ctrl/Cmd+Z
 * before it reaches the page. No capture listener, focus change, or beforeinput
 * handler here can recover an event the host never delivers. Do not add a
 * Rivto-specific workaround for that symptom; update Cursor, use an external
 * browser, or configure an alternate `undoKeys` binding instead.
 * https://forum.cursor.com/t/cmd-z-is-intercepted-using-cursor-browser/146812
 *
 * History updates the runtime synchronously, but React may need another frame
 * to reconcile editable DOM nodes. Focus restoration is therefore deferred:
 * text selections are rebuilt from block-relative offsets, while structural or
 * empty selections focus the registered surface root and clear native ranges.
 *
 * Register the extension once during `createReactEditor`. Its listeners are scoped to the
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
export interface HistoryExtensionOptions {
  /** Exact shortcuts routed to editor undo; an empty array disables keydown undo. */
  readonly undoKeys?: readonly string[];
  /** Exact shortcuts routed to editor redo; an empty array disables keydown redo. */
  readonly redoKeys?: readonly string[];
}

export function registerHistory(
  reactEditor: ReactEditor,
  options: HistoryExtensionOptions = {},
): void {
  const { editor } = reactEditor;
  /** Executes one history step and restores focus after React renders it. */
  const run = (root: HTMLElement, action: HistoryAction): void => {
    if (!root) return;
    editor[action]();
    requestAnimationFrame(() => {
      if (reactEditor.selection.restoreDOM()) return;
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
    });
  };

  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.historyUndo,
    keys: options.undoKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.historyUndo]!,
    composing: "prevent",
  }, ({ root }) => {
    run(root, "undo");
    return true;
  });

  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.historyRedo,
    keys: options.redoKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.historyRedo]!,
    composing: "prevent",
  }, ({ root }) => {
    run(root, "redo");
    return true;
  });

  reactEditor.events.register({
    id: "history.before-input",
    type: "beforeinput",
    scope: "surface",
  }, ({ raw: event, root }) => {
    const action = inputHistoryAction(event);
    if (!action) return false;

    if (!event.isComposing) run(root, action);
    return true;
  });
}
