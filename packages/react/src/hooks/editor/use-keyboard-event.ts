import { useEffect, useRef } from "react";
import type {
  KeyboardEventDefinition,
  KeyboardEditorEvent,
  EditorEventHandler,
} from "../../managers";
import { useReactEditor } from "./use-editor";

/**
 * Registers one declarative shortcut while keeping React state closures fresh.
 *
 * Binding IDs are stable for the mounted extension. Default keys remain
 * available when runtime keymap overrides are replaced or removed.
 */
export function useKeyboardEvent(
  binding: KeyboardEventDefinition,
  listener: EditorEventHandler<KeyboardEditorEvent>,
): void {
  const editor = useReactEditor();
  const bindingRef = useRef(binding);
  const listenerRef = useRef(listener);
  bindingRef.current = binding;
  listenerRef.current = listener;

  useEffect(() => editor.keyboard.register({
    ...bindingRef.current,
    when: (event) => bindingRef.current.when?.(event) ?? true,
  }, (event) => listenerRef.current(event)), [binding.id, editor]);
}
