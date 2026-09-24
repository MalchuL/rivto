import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEditorRoot } from "../../hooks";
import { SLOT_POSITIONS, BLOCK_FLOW_SLOT_POSITIONS, type BlockSlotPosition, type ReactEditorExtension } from "../../managers";

/** Control or block-slot host used as the thread endpoint. */
export type BulletThreadingAnchor = "collapse" | "drag" | BlockSlotPosition;

export interface BulletThreadingOptions {
  readonly anchor: BulletThreadingAnchor;
  /** Root vertical line distance left of the anchor, in CSS pixels. Defaults to 12. */
  readonly rootLineOffset?: number;
  /** Focused ancestry, every rendered branch, or no overlay/listeners. Defaults to focused; all costs more on large pages. */
  readonly resolution?: "focused" | "all" | "none";
  /** Block types where the thread stops before descendants; the root-level line still reaches them. Takes precedence over continueBlockTypes. */
  readonly excludeBlockTypes?: readonly string[];
  /** When provided, only these block types can carry a thread to descendants. */
  readonly continueBlockTypes?: readonly string[];
}

const BLOCK = ".page-block[data-block-id]";
const ROOT_BLOCKS = ":scope > .page-block[data-block-id], :scope > :not(.page-block) > .page-block[data-block-id]";
const DEFAULT_ROOT_LINE_OFFSET = 12;
const ROOT_LEAD_RADIUS = 6;
const BUILTIN_SELECTORS = {
  collapse: ":scope > .page-block-row .page-collapse-toggle",
  drag: ":scope > .page-block-row .page-drag-handle",
} as const;

interface ThreadPoint {
  readonly x: number;
  readonly y: number;
  readonly bottom: number;
}

function curve(fromX: number, fromY: number, toX: number, toY: number): string {
  const radius = Math.min(10, Math.abs(toX - fromX), (toY - fromY) / 2);
  const turn = Math.sign(toX - fromX) * radius;
  return ` V ${toY - radius} Q ${fromX} ${toY} ${fromX + turn} ${toY} H ${toX}`;
}

function anchorElement(block: Element, anchor: BulletThreadingAnchor): Element | null {
  if (anchor === "collapse" || anchor === "drag") {
    const preferred = block.querySelector(BUILTIN_SELECTORS[anchor]);
    if (preferred) {
      const rect = preferred.getBoundingClientRect();
      if (rect.width && rect.height) return preferred;
    }
    return block.querySelector(BUILTIN_SELECTORS[anchor === "collapse" ? "drag" : "collapse"]);
  }
  return block.querySelector(`:scope > .page-block-row > .rivto-slot[data-slot-owner="block"][data-slot-position="${anchor}"]`);
}

function ThreadOverlay({ anchor, rootLineOffset = DEFAULT_ROOT_LINE_OFFSET, resolution = "focused", excludeBlockTypes, continueBlockTypes }: BulletThreadingOptions) {
  const { element: root } = useEditorRoot();
  const overlayRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const excluded = new Set(excludeBlockTypes);
  const continued = continueBlockTypes ? new Set(continueBlockTypes) : null;

  useEffect(() => {
    if (!root || !root.matches(".page-surface")) return;
    const view = root.ownerDocument.defaultView;
    if (!view) return;
    const observer = new ResizeObserver(() => schedule());
    const observed = new Set<Element>();
    let frame = 0;

    function measure() {
      frame = 0;
      const nextObserved = new Set<Element>([root!]);
      const origin = overlayRef.current!.getBoundingClientRect();
      const cache = new Map<Element, ThreadPoint | null>();
      const point = (block: Element): ThreadPoint | null => {
        if (cache.has(block)) return cache.get(block)!;
        const control = anchorElement(block, anchor);
        if (!control) {
          cache.set(block, null);
          return null;
        }
        nextObserved.add(block);
        nextObserved.add(control);
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          cache.set(block, null);
          return null;
        }
        const value = {
          x: rect.left + rect.width / 2 - origin.left,
          y: rect.top + rect.height / 2 - origin.top,
          bottom: rect.bottom - origin.top,
        };
        cache.set(block, value);
        return value;
      };
      const canContinue = (block: Element) => {
        const type = block.getAttribute("data-block-type") ?? "";
        return !excluded.has(type) && (!continued || continued.has(type));
      };
      let path = "";

      if (resolution === "focused") {
        const active = root!.ownerDocument.activeElement;
        const focused = active && root!.contains(active) ? active.closest(BLOCK) : null;
        if (focused) {
          const roots = root!.querySelectorAll(ROOT_BLOCKS);
          const blocks: Element[] = [];
          for (let block: Element | null = focused; block && root!.contains(block); block = block.parentElement?.closest(BLOCK) ?? null) {
            blocks.unshift(block);
          }
          const stop = blocks.findIndex((block) => !canContinue(block));
          if (stop >= 0) blocks.length = stop + 1;
          let topStart: Element | undefined;
          for (const sibling of roots) {
            if (sibling === blocks[0]) break;
            if (!topStart && point(sibling)) topStart = sibling;
          }
          if (topStart) {
            blocks.unshift(topStart);
          } else {
            const first = point(blocks[0]!);
            if (first) {
              const fromX = first.x - rootLineOffset;
              const fromY = first.y - ROOT_LEAD_RADIUS * 2;
              path = `M ${fromX} ${fromY}${curve(fromX, fromY, first.x, first.y)}`;
            }
          }
          for (let index = 1; index < blocks.length; index += 1) {
            const from = point(blocks[index - 1]!);
            const to = point(blocks[index]!);
            if (!from || !to) break;
            const fromX = index === 1 && Boolean(topStart) ? to.x - rootLineOffset : from.x;
            const fromY = index === 1 && Boolean(topStart) ? from.bottom : from.y;
            if (to.y <= fromY) break;
            if (!path) path = `M ${fromX} ${fromY}`;
            path += curve(fromX, fromY, to.x, to.y);
          }
        }
      } else {
        const roots = Array.from(root!.querySelectorAll(ROOT_BLOCKS));
        const drawSiblings = (siblings: Iterable<Element>) => {
          const points = Array.from(siblings, point).filter((item): item is ThreadPoint => Boolean(item));
          if (!points.length) return;
          const trunkX = points.reduce((minimum, item) => Math.min(minimum, item.x), Infinity) - rootLineOffset;
          if (points.length === 1) {
            const item = points[0]!;
            const fromY = item.y - ROOT_LEAD_RADIUS * 2;
            path += ` M ${trunkX} ${fromY}${curve(trunkX, fromY, item.x, item.y)}`;
            return;
          }
          path += ` M ${trunkX} ${points[0]!.y - ROOT_LEAD_RADIUS} V ${points.at(-1)!.y}`;
          for (const item of points) {
            const radius = Math.min(ROOT_LEAD_RADIUS, item.x - trunkX);
            path += ` M ${trunkX} ${item.y - radius} Q ${trunkX} ${item.y} ${trunkX + radius} ${item.y} H ${item.x}`;
          }
        };
        drawSiblings(roots);
        const stack = [...roots];
        while (stack.length) {
          const parent = stack.pop()!;
          const from = point(parent);
          const children = parent.querySelectorAll(":scope > .page-block-children > .page-block");
          if (!from || !canContinue(parent)) continue;
          for (const child of children) {
            const to = point(child);
            if (to && to.y > from.y) path += ` M ${from.x} ${from.y}${curve(from.x, from.y, to.x, to.y)}`;
            stack.push(child);
          }
        }
      }
      for (const element of observed) if (!nextObserved.has(element)) observer.unobserve(element);
      for (const element of nextObserved) if (!observed.has(element)) observer.observe(element);
      observed.clear();
      for (const element of nextObserved) observed.add(element);
      const nextPath = path.trim();
      if (pathRef.current?.getAttribute("d") !== nextPath) pathRef.current?.setAttribute("d", nextPath);
    }

    function schedule() {
      if (!frame) frame = view!.requestAnimationFrame(measure);
    }

    function onScroll(event: Event) {
      // The body-hosted SVG scrolls with the document; only nested scrollers need new coordinates.
      if (event.target !== root!.ownerDocument && event.target !== view) schedule();
    }

    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    if (resolution === "focused") {
      root.addEventListener("focusin", schedule);
      root.addEventListener("focusout", schedule);
    }
    view.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", schedule);
    schedule();
    return () => {
      view.cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      if (resolution === "focused") {
        root.removeEventListener("focusin", schedule);
        root.removeEventListener("focusout", schedule);
      }
      view.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", schedule);
    };
  }, [root, anchor, rootLineOffset, resolution, excludeBlockTypes, continueBlockTypes]);

  if (!root?.matches(".page-surface")) return null;
  return createPortal(
    <svg ref={overlayRef} className="rivto-bullet-threading" aria-hidden="true" data-bullet-threading="true">
      <path ref={pathRef} />
    </svg>,
    root.ownerDocument.body,
  );
}

/** Installs optional page threading with anchor, resolution, and block-type rules. */
export function bulletThreadingExtension(options: BulletThreadingOptions): ReactEditorExtension {
  const { anchor, resolution = "focused" } = options;
  if (!["collapse", "drag", ...SLOT_POSITIONS, ...BLOCK_FLOW_SLOT_POSITIONS].includes(anchor)) {
    throw new Error(`Invalid bullet threading anchor: ${anchor}`);
  }
  if (!["focused", "all", "none"].includes(resolution)) {
    throw new Error(`Invalid bullet threading resolution: ${resolution}`);
  }
  if (options.rootLineOffset !== undefined && (!Number.isFinite(options.rootLineOffset) || options.rootLineOffset < 0)) {
    throw new Error(`Invalid bullet threading root line offset: ${options.rootLineOffset}`);
  }
  return {
    id: "block.bullet-threading",
    setup: (reactEditor) => resolution === "none" ? undefined :
      reactEditor.extensions.mount(() => <ThreadOverlay {...options} />, "afterSurface"),
  };
}
