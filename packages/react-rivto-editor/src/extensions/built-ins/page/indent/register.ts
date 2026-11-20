import type { ReactEditorExtensionApi } from "../../../../editor/types";
/** Runtime registration for page indentation keyboard behavior. */
import { KEYBOARD_BINDING_IDS } from "../../../../managers";
import type { IndentExtensionOptions } from "./types";
import { applyIndentShortcut } from "./utils";

/**
 * Installs configurable indent and outdent keyboard actions.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @param options - Optional replacement shortcuts.
 * @returns No value.
 */
export function registerIndent(reactEditor: ReactEditorExtensionApi, options: IndentExtensionOptions): void {
  const indentKeys = options.indentKeys ?? ["Tab"];
  const outdentKeys = options.outdentKeys ?? ["Shift+Tab"];
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockIndent,
      keys: indentKeys,
    },
    (event) => applyIndentShortcut(event.reactPanel.selection, event, false, event.reactPanel),
  );
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockOutdent,
      keys: outdentKeys,
    },
    (event) => applyIndentShortcut(event.reactPanel.selection, event, true, event.reactPanel),
  );
}
