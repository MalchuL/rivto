/**
 * Rivto-specific adjustments to the dnd-kit manager that owns block dragging.
 *
 * Two default behaviors of `@dnd-kit/dom` conflict with editor requirements:
 *
 * - The core `Scroller` reports every scrollable ancestor of the element under
 *   the cursor. Rivto must keep auto-scroll away from edgeless card content and
 *   from the inert document behind a native modal dialog. The core plugin
 *   cannot be swapped without breaking the keyboard sensor's plugin lookup, so
 *   its public `getScrollableElements` hook is wrapped instead.
 * - The core `StyleInjector` inserts the feedback stylesheet at drag start and
 *   removes it at drag end. That sheet contains an `@layer` rule, and Chromium
 *   answers any `@layer` change with a font-driven layout of the whole
 *   document, which costs tens of milliseconds on a 500-block page twice per
 *   gesture. Rivto ships the equivalent rules for its own overlay host in
 *   `styles.css`, so injection is switched off for this manager.
 *
 * Both patches live for the lifetime of the provider and are reverted when it
 * unmounts.
 *
 * @module
 */
import { Scroller, StyleInjector } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useLayoutEffect } from "react";
import { canPageDragAutoScroll } from "../pointer/tracker";

/**
 * Applies Rivto's auto-scroll exclusions and static feedback styling to the
 * enclosing drag-and-drop manager.
 *
 * Rendered inside the block drag provider; it owns no DOM.
 *
 * @returns Nothing; the effects patch the manager's core plugins in place.
 */
export function PageDragManagerPolicy() {
  const manager = useDragDropManager();

  useLayoutEffect(() => {
    const scroller = manager?.registry.plugins.get(Scroller);
    if (!scroller) return;
    const unfiltered = scroller.getScrollableElements;
    // A fresh Set per call keeps the scroller's cached, deep-compared value
    // untouched so its own change detection keeps working.
    scroller.getScrollableElements = () => {
      const elements = unfiltered();
      return elements ? new Set([...elements].filter(canPageDragAutoScroll)) : elements;
    };
    return () => {
      scroller.getScrollableElements = unfiltered;
    };
  }, [manager]);

  useLayoutEffect(() => {
    const injector = manager?.registry.plugins.get(StyleInjector);
    if (!injector) return;
    // `roots` is the derived set of documents the injector syncs its sheets
    // into. Shadowing it with an empty, non-reactive set makes the sync effect
    // inject nothing and drop its status subscription after the first drag.
    Object.defineProperty(injector, "roots", { configurable: true, get: () => new Set<Document | ShadowRoot>() });
    return () => {
      Reflect.deleteProperty(injector, "roots");
    };
  }, [manager]);

  return null;
}
