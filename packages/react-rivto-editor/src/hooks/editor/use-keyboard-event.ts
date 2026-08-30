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
 * available when runtime keymap overrides are replaced or removed. Structural
 * fields re-register the binding so dispatch observes the latest definition.
 *
 * @param binding - Semantic action identity, defaults, and filters.
 * @param listener - Handler returning true when it claims the native event.
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
  const keys = typeof binding.keys === "string" ? binding.keys : binding.keys.join("\u0000");
  const mode = binding.mode;
  const modeKey = Array.isArray(mode) ? mode.join("\u0000") : mode;

  useEffect(() => editor.keyboard.register({
    ...bindingRef.current,
    when: (event) => bindingRef.current.when?.(event) ?? true,
  }, (event) => listenerRef.current(event)), [
    editor,
    binding.id,
    keys,
    binding.phase,
    binding.target,
    binding.scope,
    modeKey,
    binding.composing,
    binding.priority,
  ]);
}
