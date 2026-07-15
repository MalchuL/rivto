import { createElement, type ReactNode } from "react";
import { RIVTO_SELECTION_RECT_CLASS } from "./constants";
import type { SelectionRect } from "./dom-selection";

interface SelectionRectangleProps {
  /** Viewport-space rectangle produced by the active pointer gesture. */
  readonly rect: SelectionRect;
  /** Surface root used to convert viewport coordinates into local coordinates. */
  readonly root: HTMLElement | null;
}

function styleFor(rect: SelectionRect, root: HTMLElement | null) {
  const bounds = root?.getBoundingClientRect();
  return {
    position: "absolute" as const,
    left: rect.left - (bounds?.left ?? 0),
    top: rect.top - (bounds?.top ?? 0),
    width: rect.width,
    height: rect.height,
    border: "1px solid #5a8ee8",
    background: "rgba(90, 142, 232, 0.14)",
    pointerEvents: "none" as const,
    zIndex: 20,
  };
}

/**
 * Draws the temporary rectangle used by block and edgeless area selection.
 *
 * The overlay carries its own minimal styles because it is interaction
 * feedback, not theme content. Keeping the geometry conversion here prevents
 * every surface from duplicating the same viewport-to-local math.
 */
export function SelectionRectangle({ rect, root }: SelectionRectangleProps): ReactNode {
  return createElement("div", {
    className: RIVTO_SELECTION_RECT_CLASS,
    style: styleFor(rect, root),
  });
}
