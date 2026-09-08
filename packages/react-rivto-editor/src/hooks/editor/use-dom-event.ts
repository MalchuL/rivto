import { useEffect, useRef } from "react";
import type {
  DOMEventDefinition,
  DOMEventName,
  DOMEventTarget,
  EditorEvent,
  EditorEventHandler,
} from "../../managers";
import { useReactEditor } from "./use-editor";

/**
 * Registers one typed native event through the editor's unified DOM runtime.
 *
 * The callback receives an EditorEvent with resolved surface, block, content,
 * mode, and selection values. Returning true claims it. The latest callback is
 * read through a ref, so rerenders do not reconnect native listeners.
 */
export function useDOMEvent<
  Target extends DOMEventTarget = "surface",
  Type extends DOMEventName<Target> = DOMEventName<Target>,
>(
  definition: DOMEventDefinition<Target, Type>,
  listener: EditorEventHandler<EditorEvent<Target, Type>>,
): void {
  const editor = useReactEditor();
  const definitionRef = useRef(definition);
  const listenerRef = useRef(listener);
  definitionRef.current = definition;
  listenerRef.current = listener;
  const target = definition.target;
  const scope = definition.scope;
  const mode = definition.mode;
  const modeKey = Array.isArray(mode) ? mode.join("\u0000") : mode;
  const capture = definition.capture;
  const passive = definition.passive;
  const type = definition.type;

  useEffect(() => editor.events.register({
    ...definitionRef.current,
    when: (event) => definitionRef.current.when?.(event) ?? true,
  },
    (event) => listenerRef.current(event),
  ), [
    capture,
    definition.id,
    editor,
    modeKey,
    passive,
    scope,
    target,
    type,
  ]);
}
