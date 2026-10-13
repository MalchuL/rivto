import type { ReactEditorApi } from "../../../../editor/types";
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
export function registerIndent(
  reactEditor: ReactEditorApi,
  options: IndentExtensionOptions,
): void {
  const indentKeys = options.indentKeys ?? ["Tab"];
  const outdentKeys = options.outdentKeys ?? ["Shift+Tab"];
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockIndent,
    keys: indentKeys,
  }, ({ reactPanel, root, raw: event }) => applyIndentShortcut(
    reactPanel.selection,
    root,
    event,
    false,
    reactPanel,
  ));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdent,
    keys: outdentKeys,
  }, ({ reactPanel, root, raw: event }) => applyIndentShortcut(
    reactPanel.selection,
    root,
    event,
    true,
    reactPanel,
  ));
}
