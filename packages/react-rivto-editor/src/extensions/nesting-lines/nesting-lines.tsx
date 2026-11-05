import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
import { useEditorRoot } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { PanelDOM } from "../../panels/panel-dom";

/** Identifies the scrollable block-list occurrence within a canvas card. */
const CARD_CONTENT_SELECTOR = "[data-edgeless-card-content]";

/**
 * Measures visible ordinary outline rows in one panel occurrence.
 *
 * Custom child layouts do not receive a line, but their nested ordinary
 * outlines remain eligible independently of the containing layout. Inside a
 * custom layout, a line ends at its owner's subtree rather than another item.
 *
 * @param dom - Panel-limited access to rendered blocks.
 * @param overlay - Overlay providing the coordinate origin.
 * @returns Path commands and elements whose size affects those commands.
 */
function measureLines(dom: PanelDOM, overlay: SVGSVGElement) {
  const origin = overlay.getBoundingClientRect();
  const blocks = dom.getBlocks();
  const children = new Map<Element | null, HTMLElement[]>();
  const nextSibling = new Map<Element, HTMLElement>();
  for (const block of blocks) {
    // Root blocks in different canvas cards must not become each other's siblings.
    const parent = dom.getParent(block) ?? block.closest(CARD_CONTENT_SELECTOR);
    const siblings = children.get(parent) ?? [];
    const previous = siblings.at(-1);
    if (previous) {
      nextSibling.set(previous, block);
    }
    siblings.push(block);
    children.set(parent, siblings);
  }
  const nextObserved = new Set<Element>([dom.root]);
  const lines: string[] = [];
  for (const block of blocks) {
    const first = children.get(block)?.[0];
    const childHost = first?.parentElement?.closest(`.${BLOCK_EDITOR_CLASSES.children}`);
    if (!childHost?.classList.contains(BLOCK_EDITOR_CLASSES.outline)) {
      continue;
    }
    const row = dom.getRow(block);
    const childRow = first && dom.getRow(first);
    if (!first || !row || !childRow) {
      continue;
    }
    const enclosingHost = block.parentElement?.closest(`.${BLOCK_EDITOR_CLASSES.children}`);
    const next =
      !dom.getParent(block) || enclosingHost?.classList.contains(BLOCK_EDITOR_CLASSES.outline)
        ? nextSibling.get(block)
        : undefined;
    const nextRow = next && dom.getRow(next);
    for (const element of [block, row, childRow, ...(nextRow ? [nextRow] : [])]) {
      nextObserved.add(element);
    }
    let start = row.getBoundingClientRect().bottom - origin.top;
    let end = (nextRow ?? block).getBoundingClientRect()[nextRow ? "top" : "bottom"] - origin.top;
    const content = childRow.querySelector<HTMLElement>(
      `:scope > .${BLOCK_EDITOR_CLASSES.content}`,
    );
    if (content) {
      nextObserved.add(content);
    }
    const rowBounds = childRow.getBoundingClientRect();
    const style = childRow.ownerDocument.defaultView!.getComputedStyle(childRow);
    const scale = childRow.offsetWidth ? rowBounds.width / childRow.offsetWidth : 1;
    const padding =
      (parseFloat(style.paddingInlineStart) || 0) + (parseFloat(style.columnGap) || 0);
    const contentBounds = content?.getBoundingClientRect();
    // Content bounds include in-flow controls; remove only the normal row inset.
    // Convert CSS pixels to viewport pixels so canvas zoom and RTL use the same anchor.
    const x = contentBounds
      ? (style.direction === "rtl"
          ? contentBounds.right + padding * scale
          : contentBounds.left - padding * scale) - origin.left
      : rowBounds.left - origin.left;
    const card = block.closest<HTMLElement>(CARD_CONTENT_SELECTOR);
    if (card) {
      // The body overlay is outside the card's scrollport, so clip each line here.
      const bounds = card.getBoundingClientRect();
      if (x + origin.left < bounds.left || x + origin.left > bounds.right) {
        continue;
      }
      start = Math.max(start, bounds.top - origin.top);
      end = Math.min(end, bounds.bottom - origin.top);
    }
    if (end > start) {
      lines.push(`M ${x} ${start} V ${end}`);
    }
  }
  return { d: lines.join(" "), nextObserved };
}

/**
 * Draws lines beside visible child blocks without participating in page layout.
 *
 * @returns A body-hosted overlay for the attached surface, or null before attachment.
 */
function NestingLines() {
  const { element: root } = useEditorRoot();
  const overlayRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!root) {
      return;
    }
    const view = root.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    const dom = new PanelDOM(root);
    const observed = new Set<Element>();
    const observer = new ResizeObserver(() => schedule());
    let frame = 0;

    /**
     * Updates the path, theme values, and observed geometry after a layout change.
     *
     * @returns The overlay reflects the latest rendered outline.
     */
    function measure() {
      frame = 0;
      const overlay = overlayRef.current;
      const path = pathRef.current;
      if (!overlay || !path || !root) {
        return;
      }
      const { d, nextObserved } = measureLines(dom, overlay);
      for (const element of observed) {
        if (!nextObserved.has(element)) {
          observer.unobserve(element);
        }
      }
      for (const element of nextObserved) {
        if (!observed.has(element)) {
          observer.observe(element);
        }
      }
      observed.clear();
      nextObserved.forEach((element) => observed.add(element));
      const style = view!.getComputedStyle(root);
      // A body-hosted overlay does not inherit the canvas viewport's overflow clipping.
      if (root.matches(".edgeless-viewport")) {
        const viewport = root.getBoundingClientRect();
        const bounds = overlay.getBoundingClientRect();
        overlay.style.clipPath = `inset(${Math.max(0, viewport.top - bounds.top)}px ${Math.max(0, bounds.right - viewport.right)}px ${Math.max(0, bounds.bottom - viewport.bottom)}px ${Math.max(0, viewport.left - bounds.left)}px)`;
      } else {
        overlay.style.clipPath = "";
      }
      overlay.style.setProperty("--rivto-muted", style.getPropertyValue("--rivto-muted"));
      overlay.style.setProperty("--rivto-background", style.getPropertyValue("--rivto-background"));
      if (path.getAttribute("d") !== d) {
        path.setAttribute("d", d);
      }
    }

    /**
     * Coalesces layout invalidations into one animation frame.
     *
     * @returns A pending frame will refresh the overlay.
     */
    function schedule() {
      if (!frame) {
        frame = view!.requestAnimationFrame(measure);
      }
    }

    /**
     * Schedules a refresh when a nested scroll container moves.
     *
     * @param event - Captured scroll event.
     * @returns Nested scrolling schedules updated coordinates.
     */
    function onScroll(event: Event) {
      if (event.target !== root!.ownerDocument && event.target !== view) {
        schedule();
      }
    }

    // Camera and card transforms change coordinates without resizing their contents.
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "data-controls-placement", "dir"],
    });
    root.addEventListener("focusin", schedule);
    root.addEventListener("focusout", schedule);
    view.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", schedule);
    schedule();
    return () => {
      view.cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      root.removeEventListener("focusin", schedule);
      root.removeEventListener("focusout", schedule);
      view.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", schedule);
    };
  }, [root]);

  if (!root) {
    return null;
  }
  return createPortal(
    <svg ref={overlayRef} className="rivto-nesting-lines" aria-hidden="true" data-nesting-lines>
      <path ref={pathRef} />
    </svg>,
    root.ownerDocument.body,
  );
}

/**
 * Installs the optional surface overlay for visible ordinary outlines.
 *
 * Custom layouts can use the shared outline class on their child host when
 * they use the same indented presentation. Other layouts do not get a line,
 * while ordinary outlines nested inside them remain visible.
 *
 * @returns Extension that mounts and cleans up the overlay with the surface.
 */
export function nestingLinesExtension(): ReactEditorExtension {
  return {
    id: "block.nesting-lines",
    setup: (editor) => editor.extensions.mount(() => <NestingLines />, "afterSurface"),
  };
}
