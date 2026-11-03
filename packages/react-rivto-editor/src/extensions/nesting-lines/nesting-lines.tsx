import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
import { useEditorRoot } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { PanelDOM } from "../../panels/panel-dom";

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
    const parent = dom.getParent(block);
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
    const start = row.getBoundingClientRect().bottom - origin.top;
    const end = (nextRow ?? block).getBoundingClientRect()[nextRow ? "top" : "bottom"] - origin.top;
    const x = childRow.getBoundingClientRect().left - origin.left;
    if (end > start) {
      lines.push(`M ${x} ${start} V ${end}`);
    }
  }
  return { d: lines.join(" "), nextObserved };
}

/**
 * Draws lines beside visible child blocks without participating in page layout.
 *
 * @returns A body-hosted overlay for a page surface, or null on other surfaces.
 */
function NestingLines() {
  const { element: root } = useEditorRoot();
  const overlayRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!root?.matches(".page-surface")) {
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

    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
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

  if (!root?.matches(".page-surface")) {
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
 * Installs the optional page overlay for visible ordinary outlines.
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
