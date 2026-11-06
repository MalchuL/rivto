import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
import { useEditorRoot } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { findPanelElements, PanelDOM } from "../../panels/panel-dom";

/** Identifies the scrollable block-list occurrence within a canvas card. */
const CARD_CONTENT_SELECTOR = "[data-edgeless-card-content]";

/** Measured control geometry and the lowest preceding bottom edge. */
interface MeasuredControl {
  readonly element: HTMLElement;
  readonly bounds: DOMRect;
  readonly maximumBottom: number;
}

/** Rectangle edges in viewport coordinates. */
type Bounds = Pick<DOMRectReadOnly, "left" | "right" | "top" | "bottom">;

/**
 * Measures visible-size start-slot controls in vertical order.
 *
 * @param dom - Panel-limited access to the mounted occurrence.
 * @returns Controls with prefix bottom bounds for efficient vertical lookup.
 */
function measureRowControls(dom: PanelDOM): MeasuredControl[] {
  const controls = findPanelElements(
    dom.root,
    `.${BLOCK_EDITOR_CLASSES.row} > .${BLOCK_EDITOR_CLASSES.slot}[data-slot-position="start"] > *`,
  )
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(({ bounds }) => bounds.width > 0 && bounds.height > 0)
    .sort((left, right) => left.bounds.top - right.bounds.top);
  let maximumBottom = -Infinity;
  return controls.map((control) => {
    maximumBottom = Math.max(maximumBottom, control.bounds.bottom);
    return { ...control, maximumBottom };
  });
}

/**
 * Finds painted controls intersecting one nesting line.
 *
 * @param controls - Controls sorted by top edge with prefix bottom bounds.
 * @param line - Line's stroke bounds in viewport coordinates.
 * @param observed - Elements whose later size changes must refresh the overlay.
 * @returns Bounds of visible controls intersecting the line.
 */
function intersectingControlBounds(
  controls: readonly MeasuredControl[],
  line: Bounds,
  observed: Set<Element>,
): DOMRect[] {
  // Prefix maxima skip controls above the line without missing unusually tall controls.
  let low = 0;
  let high = controls.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (controls[middle]!.maximumBottom > line.top) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  const result: DOMRect[] = [];
  for (let index = low; index < controls.length; index += 1) {
    const { element, bounds } = controls[index]!;
    if (bounds.top >= line.bottom) {
      break;
    }
    if (bounds.bottom <= line.top || bounds.right <= line.left || bounds.left >= line.right) {
      continue;
    }
    observed.add(element);
    const style = element.ownerDocument.defaultView!.getComputedStyle(element);
    if (style.visibility !== "hidden" && style.opacity !== "0") {
      result.push(bounds);
    }
  }
  return result;
}

/**
 * Measures the painted edges of active drop feedback in viewport coordinates.
 *
 * The nesting overlay is mounted above surface stacking contexts, so its lines
 * must leave gaps where a drop outline or insertion line is painted underneath.
 *
 * @param overlay - Overlay whose document owns the active feedback.
 * @returns Rectangles occupied by active feedback.
 */
function measureDropFeedback(overlay: SVGSVGElement) {
  const document = overlay.ownerDocument;
  const view = document.defaultView!;
  const rects: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[data-block-drop-active="true"]')) {
    const bounds = element.getBoundingClientRect();
    const scale = element.offsetWidth ? bounds.width / element.offsetWidth : 1;
    const thickness =
      (parseFloat(
        view.getComputedStyle(element).getPropertyValue("--rivto-drop-indicator-thickness"),
      ) || 4) * scale;
    rects.push(
      { left: bounds.left, right: bounds.left + thickness, top: bounds.top, bottom: bounds.bottom },
      {
        left: bounds.right - thickness,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      },
      { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.top + thickness },
      {
        left: bounds.left,
        right: bounds.right,
        top: bounds.bottom - thickness,
        bottom: bounds.bottom,
      },
    );
  }
  for (const line of document.querySelectorAll<HTMLElement>(
    `.${BLOCK_EDITOR_CLASSES.dropLine}:not([hidden])`,
  )) {
    rects.push(line.getBoundingClientRect());
  }
  return rects;
}

/**
 * Measures visible ordinary outline rows in one panel occurrence.
 *
 * Custom child layouts do not receive a line, but their nested ordinary
 * outlines remain eligible independently of the containing layout. An outline
 * can suppress its own line with data-hide-nesting-line without hiding deeper lines. Inside a
 * custom layout, a line ends at its owner's subtree rather than another item.
 *
 * @param dom - Panel-limited access to rendered blocks.
 * @param overlay - Overlay providing the coordinate origin.
 * @returns Path commands and elements whose size affects those commands.
 */
function measureLines(dom: PanelDOM, overlay: SVGSVGElement) {
  const origin = overlay.getBoundingClientRect();
  const feedback = measureDropFeedback(overlay);
  const strokeRadius =
    parseFloat(
      overlay.ownerDocument.defaultView!.getComputedStyle(overlay.querySelector("path")!)
        .strokeWidth,
    ) / 2;
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
  let controls: MeasuredControl[] | undefined;
  for (const block of blocks) {
    const first = children.get(block)?.[0];
    const childHost = first?.parentElement?.closest(`.${BLOCK_EDITOR_CLASSES.children}`);
    if (
      !childHost?.classList.contains(BLOCK_EDITOR_CLASSES.outline) ||
      childHost.getAttribute("data-hide-nesting-line") === "true"
    ) {
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
    const startSlot = childRow.querySelector<HTMLElement>(
      `:scope > .${BLOCK_EDITOR_CLASSES.slot}[data-slot-position="start"]`,
    );
    const anchor = startSlot ?? content;
    if (anchor) {
      nextObserved.add(anchor);
    }
    const rowBounds = childRow.getBoundingClientRect();
    const style = childRow.ownerDocument.defaultView!.getComputedStyle(childRow);
    const scale = childRow.offsetWidth ? rowBounds.width / childRow.offsetWidth : 1;
    const padding =
      (parseFloat(style.paddingInlineStart) || 0) +
      (startSlot ? 0 : parseFloat(style.columnGap) || 0);
    const anchorBounds = anchor?.getBoundingClientRect();
    // Anchor before list controls, while retaining the inset for in-flow handles.
    // Convert CSS pixels to viewport pixels so canvas zoom and RTL use the same anchor.
    const x = anchorBounds
      ? (style.direction === "rtl"
          ? anchorBounds.right + padding * scale
          : anchorBounds.left - padding * scale) - origin.left
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
    if (end <= start) {
      continue;
    }
    // The body overlay also sits above in-flow controls, so preserve their paint.
    controls ??= measureRowControls(dom);
    const controlBounds = intersectingControlBounds(
      controls,
      {
        left: x + origin.left - strokeRadius,
        right: x + origin.left + strokeRadius,
        top: start + origin.top,
        bottom: end + origin.top,
      },
      nextObserved,
    );
    // Keep controls and drop feedback visible without hiding the rest of the line.
    const gaps = [...feedback, ...controlBounds]
      .filter(
        (rect) =>
          x + origin.left + strokeRadius > rect.left && x + origin.left - strokeRadius < rect.right,
      )
      .map((rect) => ({ start: rect.top - origin.top, end: rect.bottom - origin.top }))
      .sort((a, b) => a.start - b.start);
    for (const gap of gaps) {
      if (gap.start > start && start < end) {
        lines.push(`M ${x} ${start} V ${Math.min(gap.start, end)}`);
      }
      start = Math.max(start, gap.end);
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
      // The portal does not inherit clipping from an embedded surface's ancestors.
      const bounds = overlay.getBoundingClientRect();
      let top = -Infinity;
      let right = Infinity;
      let bottom = Infinity;
      let left = -Infinity;
      let clipped = false;
      for (
        let element: HTMLElement | null = root;
        element && element !== root.ownerDocument.body;
        element = element.parentElement
      ) {
        const overflow = view!.getComputedStyle(element);
        const clipX = overflow.overflowX !== "visible";
        const clipY = overflow.overflowY !== "visible";
        if (clipX || clipY) {
          const rect = element.getBoundingClientRect();
          if (clipX) {
            left = Math.max(left, rect.left);
            right = Math.min(right, rect.right);
          }
          if (clipY) {
            top = Math.max(top, rect.top);
            bottom = Math.min(bottom, rect.bottom);
          }
          clipped = true;
        }
      }
      // Unclipped axes must remain visible beyond the SVG's viewport-sized box.
      const extent = Math.max(
        root.ownerDocument.documentElement.scrollHeight,
        bounds.width,
        bounds.height,
      );
      overlay.style.clipPath = clipped
        ? `inset(${Number.isFinite(top) ? top - bounds.top : -extent}px ${Number.isFinite(right) ? bounds.right - right : -extent}px ${Number.isFinite(bottom) ? bounds.bottom - bottom : -extent}px ${Number.isFinite(left) ? left - bounds.left : -extent}px)`
        : "";
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
     * Schedules a refresh when a scroll container moves.
     *
     * @returns Scrolling schedules updated coordinates and clipping.
     */
    function onScroll() {
      schedule();
    }

    // Camera and card transforms change coordinates without resizing their contents.
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "style",
        "data-controls-placement",
        "data-block-drop-active",
        "dir",
        "hidden",
      ],
    });
    // Embedded panels move when a camera or card outside their root transforms.
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      mutations.observe(ancestor, {
        attributes: true,
        attributeFilter: ["style", "class", "data-block-drop-active", "dir", "hidden"],
      });
    }
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
