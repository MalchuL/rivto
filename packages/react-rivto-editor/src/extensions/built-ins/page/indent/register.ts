import type { EditorRuntime } from "../../../../editor/editor-runtime";
/** Runtime registration for page indentation keyboard behavior. */
import { KEYBOARD_BINDING_IDS } from "../../../../managers";
import type { IndentExtensionOptions } from "./types";
import { applyIndentShortcut } from "./utils";

/**
 * Installs configurable indent and outdent keyboard actions.
 *
 * @param editorRuntime - Runtime receiving the keyboard bindings.
 * @param options - Optional replacement shortcuts.
 * @returns No value.
 */
export function registerIndent(
  editorRuntime: EditorRuntime,
  options: IndentExtensionOptions,
): void {
  const indentKeys = options.indentKeys ?? ["Tab"];
  const outdentKeys = options.outdentKeys ?? ["Shift+Tab"];
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockIndent,
    keys: indentKeys,
  }, ({ editorView, root, raw: event }) => applyIndentShortcut(
    editorView.selection,
    root,
    event,
    false,
    editorView,
  ));
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdent,
    keys: outdentKeys,
  }, ({ editorView, root, raw: event }) => applyIndentShortcut(
    editorView.selection,
    root,
    event,
    true,
    editorView,
  ));
}
