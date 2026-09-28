/**
 * Optional page-surface overlay connecting rendered block anchors.
 *
 * @module
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEditorRoot } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { buildThreadPath, type ThreadPoint } from "./thread-path";

/**
 * Resolves the visible control or slot used as a block's thread endpoint.
 *
 * @param block - Rendered block shell being measured.
 * @returns Anchor element, or null when the block should be skipped.
 */
export type BulletThreadingAnchor = (block: Element) => Element | null;

/** Configuration for the optional page-surface bullet-threading overlay. */
export interface BulletThreadingOptions {
  /** Resolve an anchor from each rendered block. Return null to skip that block. */
  readonly anchor: BulletThreadingAnchor;
  /** Horizontal distance from a root anchor to its vertical line, in CSS pixels. Defaults to 12. */
  readonly rootLineOffset?: number;
  /** Block types where the thread stops before descendants; the root-level line still reaches them. Takes precedence over continueBlockTypes. */
  readonly excludeBlockTypes?: readonly string[];
  /** When provided, only these block types can carry a thread to descendants. */
  readonly continueBlockTypes?: readonly string[];
}

const DEFAULT_ROOT_LINE_OFFSET = 12;

/**
 * Measures block anchors and renders their generated path into a body overlay.
 *
 * Measurements are cached for each animation frame. Resize, mutation, focus,
 * nested-scroll, and viewport events schedule a new frame rather than measuring
 * synchronously inside the event handler.
 *
 * @param props - Anchor resolver, offset, and traversal rules.
 * @returns Body-hosted SVG overlay for page mode, or null for other surfaces.
 */
function ThreadOverlay({ anchor, rootLineOffset = DEFAULT_ROOT_LINE_OFFSET, excludeBlockTypes, continueBlockTypes }: BulletThreadingOptions) {
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
      // Measure each block once per frame and observe the exact elements supplying its geometry.
      const cache = new Map<Element, ThreadPoint | null>();
      const point = (block: Element): ThreadPoint | null => {
        if (cache.has(block)) return cache.get(block)!;
        const control = anchor(block);
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
      const path = buildThreadPath({ root: root!, rootLineOffset, excluded, continued, point });
      for (const element of observed) if (!nextObserved.has(element)) observer.unobserve(element);
      for (const element of nextObserved) if (!observed.has(element)) observer.observe(element);
      observed.clear();
      for (const element of nextObserved) observed.add(element);
      if (pathRef.current?.getAttribute("d") !== path) pathRef.current?.setAttribute("d", path);
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
  }, [root, anchor, rootLineOffset, excludeBlockTypes, continueBlockTypes]);

  if (!root?.matches(".page-surface")) return null;
  return createPortal(
    <svg ref={overlayRef} className="rivto-bullet-threading" aria-hidden="true" data-bullet-threading="true">
      <path ref={pathRef} />
    </svg>,
    root.ownerDocument.body,
  );
}

/**
 * Installs optional page threading with anchor and block-type rules.
 *
 * @param options - Anchor resolver and optional rendering constraints.
 * @returns React editor extension mounting the page overlay after the surface.
 * @throws When the anchor or root-line offset is invalid.
 */
export function bulletThreadingExtension(options: BulletThreadingOptions): ReactEditorExtension {
  const { anchor } = options;
  if (typeof anchor !== "function") {
    throw new Error("Bullet threading anchor must be a function");
  }
  if (options.rootLineOffset !== undefined && (!Number.isFinite(options.rootLineOffset) || options.rootLineOffset < 0)) {
    throw new Error(`Invalid bullet threading root line offset: ${options.rootLineOffset}`);
  }
  return {
    id: "block.bullet-threading",
    setup: (reactEditor) => reactEditor.extensions.mount(() => <ThreadOverlay {...options} />, "afterSurface"),
  };
}
