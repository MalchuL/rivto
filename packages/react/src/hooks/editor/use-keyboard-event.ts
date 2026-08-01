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
 * Binding IDs are stable for the mounted extension. Default keys are resolved
 * against the creation-time keymap once when the binding is installed.
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

  useEffect(() => editor.events.register({
    ...bindingRef.current,
    when: (event) => bindingRef.current.when?.(event) ?? true,
  }, (event) => listenerRef.current(event)), [binding.id, editor]);
}
