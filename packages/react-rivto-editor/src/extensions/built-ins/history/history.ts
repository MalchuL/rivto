import type { ReactEditorExtensionApi } from "../../../editor/types";
import type { HistoryAction, HistoryPanel } from "./types";
import { KEYBOARD_BINDING_IDS } from "../../../managers";
import type { InputRoot, TextInputData } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../../panels/types";

/**
 * Resolves history requests emitted directly by a contenteditable element.
 *
 * @param input - Copied editing data, or undefined for a non-input event.
 * @returns Undo or redo for a history request, otherwise undefined.
 */
function inputHistoryAction(input: TextInputData | undefined): HistoryAction | undefined {
  if (input?.inputType === "historyUndo") {
    return "undo";
  }
  if (input?.inputType === "historyRedo") {
    return "redo";
  }
}

/**
 * Routes browser undo and redo gestures through the editor's CRDT history.
 *
 * A contenteditable normally owns a private DOM undo stack. Allowing that stack
 * to run would mutate rendered text first, after which `onInput` would record
 * the browser's old DOM as a new collaborative edit. This extension prevents that
 * native operation and invokes `editor.history.undo()` or `editor.history.redo()` instead.
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
 * <EditorPanel editor={reactEditor} documentId={documentId}>
 *   <HistoryPlugin />
 *   <PageSurface />
 * </EditorPanel>
 * ```
 */
export interface HistoryExtensionOptions {
  /** Exact shortcuts routed to editor undo; an empty array disables keydown undo. */
  readonly undoKeys?: readonly string[];
  /** Exact shortcuts routed to editor redo; an empty array disables keydown redo. */
  readonly redoKeys?: readonly string[];
}

export function registerHistory(
  reactEditor: ReactEditorExtensionApi,
  options: HistoryExtensionOptions = {},
): void {
  /**
   * Executes one history step and restores focus after React renders it.
   *
   * @param reactPanel - Panel whose document history is changed.
   * @param inputRoot - Originating attachment, invalidated when its panel detaches.
   * @param inputRegistration - Routing lifetime captured by the originating input.
   * @param action - Undo or redo operation to perform.
   * @returns History is updated and selection restoration is scheduled when still attached.
   * @throws Propagates synchronous history or scheduling failures. Browser failures
   * during restoration are raised by the scheduled callback.
   */
  const run = (
    reactPanel: HistoryPanel,
    inputRoot: Pick<InputRoot, "isAttached" | "clearSelection" | "focus">,
    inputRegistration: PanelInputRegistration,
    action: HistoryAction,
  ): void => {
    if (!inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    reactPanel.document.history[action]();
    if (!inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    // Only restore selection and its focus here; undo/redo has already changed the document.
    reactPanel.selection.scheduleIfSelectionUnchanged(() => {
      if (!inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      if (reactPanel.selection.restoreDOM()) {
        return;
      }
      if (!inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      inputRoot.clearSelection();
      if (inputRegistration.isCurrent(inputRoot)) {
        inputRoot.focus();
      }
    });
  };

  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.historyUndo,
      keys: options.undoKeys ?? ["Primary+z"],
      composing: "prevent",
    },
    ({ reactPanel, inputRoot, inputRegistration }) => {
      run(reactPanel, inputRoot, inputRegistration, "undo");
      return true;
    },
  );

  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.historyRedo,
      keys: options.redoKeys ?? ["Primary+Shift+z", "Primary+y"],
      composing: "prevent",
    },
    ({ reactPanel, inputRoot, inputRegistration }) => {
      run(reactPanel, inputRoot, inputRegistration, "redo");
      return true;
    },
  );

  reactEditor.events.register(
    {
      id: "history.before-input",
      type: "beforeinput",
      scope: "surface",
    },
    ({ reactPanel, textInput, inputRoot, inputRegistration }) => {
      const action = inputHistoryAction(textInput);
      if (!action) {
        return false;
      }

      if (!textInput?.isComposing) {
        run(reactPanel, inputRoot, inputRegistration, action);
      }
      return true;
    },
  );
}
