/** Runtime registration for page indentation keyboard behavior. */
import { KEYBOARD_BINDING_IDS } from "../../../../managers";
import type { ReactEditor } from "../../../../types";
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
  reactEditor: ReactEditor,
  options: IndentExtensionOptions,
): void {
  const indentKeys = options.indentKeys ?? ["Tab"];
  const outdentKeys = options.outdentKeys ?? ["Shift+Tab"];
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockIndent,
    keys: indentKeys,
  }, ({ editor, root, raw: event }) => applyIndentShortcut(
    editor,
    reactEditor.selection,
    root,
    event,
    false,
    reactEditor,
  ));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdent,
    keys: outdentKeys,
  }, ({ editor, root, raw: event }) => applyIndentShortcut(
    editor,
    reactEditor.selection,
    root,
    event,
    true,
    reactEditor,
  ));
}
