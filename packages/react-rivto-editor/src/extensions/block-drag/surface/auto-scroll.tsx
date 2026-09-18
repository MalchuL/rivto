/**
 * Auto-scroll exclusion policy for page drag gestures.
 *
 * dnd-kit's `AutoScroller` scrolls whichever ancestors its core `Scroller`
 * reports for the element under the cursor. Rivto must keep that list away
 * from edgeless card content and from the inert document behind a native
 * modal dialog. The core plugin cannot be swapped without losing the
 * keyboard sensor's plugin lookup, so this component wraps the scroller's
 * public `getScrollableElements` hook for the lifetime of the provider.
 *
 * @module
 */
import { Scroller } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useLayoutEffect } from "react";
import { canPageDragAutoScroll } from "../pointer/tracker";

/**
 * Filters dnd-kit's scrollable ancestors through {@link canPageDragAutoScroll}.
 *
 * Rendered inside the block drag provider; it owns no DOM.
 *
 * @returns Nothing; the effect patches the manager's scroller in place.
 */
export function PageDragAutoScrollPolicy() {
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
  return null;
}
