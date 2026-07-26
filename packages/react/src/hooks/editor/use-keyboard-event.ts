import { useEffect, useRef } from "react";
import type {
  KeyboardBinding,
  KeyboardEditorEventContext,
  EditorEventHandler,
} from "../../events";
import { useReactEditor } from "./use-editor";

/**
 * Registers one declarative shortcut while keeping React state closures fresh.
 *
 * Binding IDs are stable for the mounted plugin. Default keys are resolved
 * against the creation-time keymap once when the binding is installed.
 */
export function useKeyboardEvent(
  binding: KeyboardBinding,
  listener: EditorEventHandler<KeyboardEditorEventContext>,
): void {
  const editor = useReactEditor();
  const bindingRef = useRef(binding);
  const listenerRef = useRef(listener);
  bindingRef.current = binding;
  listenerRef.current = listener;

  useEffect(() => editor.events.bind({
    ...bindingRef.current,
    when: (context) => bindingRef.current.when?.(context) ?? true,
  }, (context) => listenerRef.current(context)), [binding.id, editor]);
}
