/**
 * Auto-scroll policy for page drag gestures.
 *
 * dnd-kit's `AutoScroller` scrolls whichever ancestors its core `Scroller`
 * reports for the element under the cursor. Rivto must keep that list away
 * from edgeless card content and from the inert document behind a native
 * modal dialog. Long single-scroller pages use the raw viewport pointer to
 * avoid dnd-kit's repeated viewport layout reads while scrolling. The core
 * plugin remains installed for keyboard and nested scrolling; this component
 * wraps its public scroller hooks for the lifetime of the provider.
 *
 * @module
 */
import { Scroller } from "@dnd-kit/dom";
import { isKeyboardEvent } from "@dnd-kit/dom/utilities";
import { useDragDropManager } from "@dnd-kit/react";
import { useLayoutEffect } from "react";
import { canPageDragAutoScroll } from "../pointer/tracker";
import type { PointerCoordinates } from "../types";

/**
 * Filters dnd-kit's scrollable ancestors and optimizes long page scrolling.
 *
 * Rendered inside the block drag provider; it owns no DOM.
 *
 * @param props - Access to the live pointer, which stays fixed in viewport
 * coordinates while dnd-kit adjusts its position for scrolling.
 * @returns Nothing; the effect patches the manager's scroller in place.
 */
export function PageDragAutoScrollPolicy({ getPointer }: { readonly getPointer: () => PointerCoordinates | null }) {
  const manager = useDragDropManager();
  useLayoutEffect(() => {
    const scroller = manager?.registry.plugins.get(Scroller);
    if (!manager || !scroller) return;
    const unfiltered = scroller.getScrollableElements;
    const originalScroll = scroller.scroll;
    let lastScrolledAt = -Infinity;
    // A fresh Set per call keeps the scroller's cached, deep-compared value
    // untouched so its own change detection keeps working.
    scroller.getScrollableElements = () => {
      const elements = unfiltered();
      return elements ? new Set([...elements].filter(canPageDragAutoScroll)) : elements;
    };
    // A long plain page has one scrolling element. Reading dnd-kit's viewport
    // rectangle on every 10 ms auto-scroll tick forces layout across its
    // blocks, so scroll that element from viewport pointer coordinates.
    // Short pages, nested scrollers, and keyboards retain library behavior.
    /**
     * Scrolls a long page from the raw pointer or uses dnd-kit's other paths.
     *
     * @param options - Explicit keyboard scroll distance, when present.
     * @param scrollOptions - Edge threshold and acceleration configuration.
     * @returns Whether the active scroller can continue moving.
     */
    scroller.scroll = (options, scrollOptions) => {
      const pointer = getPointer();
      const document = manager.dragOperation.source?.element?.ownerDocument;
      const scrollElement = document?.scrollingElement;
      const elements = pointer && scrollElement ? scroller.getScrollableElements() : null;
      if (!pointer || isKeyboardEvent(manager.dragOperation.activatorEvent)
        || options?.by || !scrollElement || !document?.defaultView
        || elements?.size !== 1 || !elements.has(scrollElement)
        || scrollElement.scrollWidth > scrollElement.clientWidth
        || scrollElement.scrollHeight <= document.defaultView.innerHeight * 10) {
        return originalScroll(options, scrollOptions);
      }
      const viewportHeight = document.defaultView.innerHeight;
      const threshold = viewportHeight * (scrollOptions?.threshold?.y ?? 0.2);
      if (threshold <= 0) return originalScroll(options, scrollOptions);
      // The library updates its position after scroll and may call us before
      // the pointer tracker sees the newest event. Use its position to arm the
      // interval, then the raw pointer so the edge zone never drifts.
      const currentY = scroller.autoScrolling ? pointer.y : manager.dragOperation.position.current.y;
      const distance = currentY < threshold
        ? currentY - threshold
        : currentY > viewportHeight - threshold
          ? currentY - (viewportHeight - threshold)
          : 0;
      const delta = Math.sign(distance) * Math.min(20, Math.ceil(Math.abs(distance) / threshold * 20));
      // One write per ~two frames leaves time for the preview to paint while
      // preserving roughly the same scroll distance per second.
      if (delta && performance.now() - lastScrolledAt < 32) return true;
      const before = scrollElement.scrollTop;
      if (delta) {
        scrollElement.scrollTop += delta;
        lastScrolledAt = performance.now();
      }
      return delta !== 0 && scrollElement.scrollTop !== before;
    };
    return () => {
      scroller.getScrollableElements = unfiltered;
      scroller.scroll = originalScroll;
    };
  }, [getPointer, manager]);
  return null;
}
