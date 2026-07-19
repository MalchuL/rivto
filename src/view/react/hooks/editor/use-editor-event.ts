import { useEffect, useRef } from "react";
import { useEditorRoot } from "./use-editor-root";

/**
 * Callback type for one native event supported by an HTML element.
 *
 * `HTMLElementEventMap` is supplied by TypeScript's DOM library. It maps event
 * names to their event objects, for example:
 *
 * ```ts
 * HTMLElementEventMap["keydown"]     // KeyboardEvent
 * HTMLElementEventMap["pointerdown"] // PointerEvent
 * ```
 *
 * `Type extends keyof HTMLElementEventMap` means that `Type` must be one of
 * those known names. As a result, choosing `"keydown"` automatically gives the
 * callback a `KeyboardEvent` instead of an untyped `Event`.
 */
export type EditorEventListener<Type extends keyof HTMLElementEventMap> = (
  event: HTMLElementEventMap[Type],
) => void;

/**
 * Attaches one typed native event listener to the active surface root.
 *
 * Delegation keeps block components free from repeated listeners and lets a
 * plugin locate the originating block through stable `data-block-id` and
 * `data-block-content` markers. The listener follows surface replacement and
 * is removed automatically when its component unmounts.
 *
 * The latest listener function is read through a ref, so inline callbacks do
 * not cause native listener churn. Plugins compose by checking
 * `event.defaultPrevented` before acting and calling `preventDefault()` only
 * when they own the event.
 *
 * Event delegation means the listener is attached once to the surface root,
 * not once to every block. Browser events bubble upward from the element where
 * they happened:
 *
 * ```text
 * editable block -> BlockView -> PageSurface root -> listener
 * ```
 *
 * The callback can inspect `event.target` and use `closest("[data-block-id]")`
 * to discover which block produced the event.
 *
 * @example
 * ```tsx
 * useEditorEvent("keydown", (event) => {
 *   // `event` is inferred as KeyboardEvent because the name is "keydown".
 *   if (event.defaultPrevented || event.key !== "Tab") return;
 *   event.preventDefault();
 * });
 * ```
 *
 * @param type - Native HTMLElement event name such as keydown or pointerdown.
 * @param listener - Typed callback invoked for events bubbling through the root.
 * @param options - Native listener options; memoize object values when reused.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorEvent<Type extends keyof HTMLElementEventMap>(
  type: Type,
  listener: EditorEventListener<Type>,
  options?: boolean | AddEventListenerOptions,
): void {
  // The active surface puts the real DOM element into EditorRootContext by
  // assigning useEditorRoot().ref to its container. Before that ref runs,
  // `element` is null and there is nowhere to attach a browser listener.
  const { element } = useEditorRoot();

  // A component commonly passes a new arrow function on every render. Keeping
  // the latest function in a ref lets the installed native listener call new
  // logic without removing and adding a browser listener on every render.
  // Updating `.current` does not cause another React render.
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  // Effects run after React has committed DOM changes. This is the correct time
  // to connect code to a real browser element and to return teardown logic.
  useEffect(() => {
    // The surface may not be mounted yet. When its ref later supplies an
    // element, EditorRootContext updates and this effect runs again.
    if (!element) return;

    // This stable wrapper is the function registered with the browser. It reads
    // listenerRef.current at event time, so it always invokes the newest React
    // callback even though the wrapper itself belongs to this effect run.
    const handleEvent = (event: HTMLElementEventMap[Type]) => listenerRef.current(event);

    // This is the native DOM API, equivalent to:
    // pageSurfaceElement.addEventListener("keydown", callback).
    element.addEventListener(type, handleEvent, options);

    // React calls this cleanup before the effect runs again and when the plugin
    // unmounts. The exact same wrapper must be passed to removeEventListener;
    // creating another function here would leave the old listener installed.
    return () => element.removeEventListener(type, handleEvent, options);

    // A new root, event name, or options value requires a fresh native listener.
    // `listener` is deliberately absent because listenerRef handles its updates.
  }, [element, options, type]);
}
