import { useEffect, useRef } from "react";
import type {
  DOMEditorEventContext,
  DOMEditorEventName,
  DOMEditorEventOptions,
  DOMEditorEventTarget,
  EditorEventHandler,
} from "../../managers";
import { useReactEditor } from "./use-editor";

/**
 * Registers one typed native event through the editor's unified DOM runtime.
 *
 * The callback receives resolved root, block, content, mode, and selection
 * context. Returning true claims the event. The latest callback is read through
 * a ref, so rerenders do not reconnect native listeners.
 */
export function useDOMEvent<
  Target extends DOMEditorEventTarget = "root",
  Type extends DOMEditorEventName<Target> = DOMEditorEventName<Target>,
>(
  type: Type,
  listener: EditorEventHandler<DOMEditorEventContext<Target, Type>>,
  options: DOMEditorEventOptions<Target> = {},
): void {
  const editor = useReactEditor();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const target = options.target;
  const mode = options.mode;
  const modeKey = Array.isArray(mode) ? mode.join("\u0000") : mode;
  const capture = options.capture;
  const passive = options.passive;

  useEffect(() => editor.events.on(
    type,
    (context) => listenerRef.current(context),
    { target, mode, capture, passive } as DOMEditorEventOptions<Target>,
  ), [capture, editor, modeKey, passive, target, type]);
}
