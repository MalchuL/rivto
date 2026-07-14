import { createElement, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import { blockIdsInRect, clearNativeSelection, RIVTO_BLOCK_SELECTOR, RIVTO_SELECTION_RECT_CLASS, type SelectionRect } from "../selection";
import type { Surface, SurfaceRenderProps } from "../editor/types";
import { renderBlock } from "./render-block";

const DEFAULT_LAYOUT = { x: 0, y: 0, width: 320, height: 120, zIndex: 0 };

function selectionRectStyle(rect: SelectionRect, root: HTMLElement | null) {
  return {
    left: rect.left - (root?.getBoundingClientRect().left ?? 0),
    top: rect.top - (root?.getBoundingClientRect().top ?? 0),
    width: rect.width,
    height: rect.height,
  };
}

function renderCanvasBlock(block: EditorBlock, props: SurfaceRenderProps): ReactNode {
  const content = renderBlock(block, props, "edgeless");
  if (!content) return null;
  const layout = { ...DEFAULT_LAYOUT, ...block.layout };
  const style: CSSProperties = {
    position: "absolute",
    left: layout.x,
    top: layout.y,
    width: layout.width,
    minHeight: layout.height,
    zIndex: layout.zIndex,
  };
  return createElement("div", { key: block.id, style }, content);
}

/**
 * Renders root blocks on a DOM-positioned edgeless plane.
 *
 * This stays deliberately simple. DOM positioning keeps text selection and the
 * existing React block renderers working; a canvas engine can be added later
 * only if we need real graphics performance.
 */
export function EdgelessSurface(props: SurfaceRenderProps): ReactNode {
  const canvas = useRef<HTMLDivElement>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const blocks = props.editor.getBlocks();

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(RIVTO_BLOCK_SELECTOR)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    dragStart.current = { x: event.clientX, y: event.clientY };
    props.editor.execute("selection.clear");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const root = canvas.current;
    const start = dragStart.current;
    if (!root || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
    event.preventDefault();
    clearNativeSelection(root);
    const rect = {
      left: Math.min(start.x, event.clientX),
      top: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    };
    setSelectionRect(rect);
    const blockIds = blockIdsInRect(root, rect);
    if (blockIds.length) props.editor.execute("selection.set", { selection: { type: "edgeless", blockIds } });
    else props.editor.execute("selection.clear");
  };

  const onPointerUp = (): void => {
    dragStart.current = null;
    setSelectionRect(null);
  };

  return createElement(
    "div",
    {
      ref: canvas,
      "data-rivto-surface-content": "edgeless",
      tabIndex: 0,
      style: { position: "relative", width: "100%", height: "100%" },
      onPointerDownCapture: onPointerDown,
      onPointerMoveCapture: onPointerMove,
      onPointerUpCapture: onPointerUp,
    },
    createElement("svg", { width: "2400", height: "1600", "aria-hidden": true }, props.editor.getLinks().map((link) => {
      const from = blocks.find((block) => block.id === link.from.blockId)?.layout;
      const to = blocks.find((block) => block.id === link.to.blockId)?.layout;
      return from && to
        ? createElement("line", {
            key: link.id,
            x1: from.x + from.width / 2,
            y1: from.y + from.height / 2,
            x2: to.x + to.width / 2,
            y2: to.y + to.height / 2,
            stroke: "currentColor",
            strokeWidth: "2",
          })
        : null;
    })),
    blocks.map((block) => renderCanvasBlock(block, props)),
    selectionRect && createElement("div", {
      className: RIVTO_SELECTION_RECT_CLASS,
      style: selectionRectStyle(selectionRect, canvas.current),
    }),
  );
}

/** Default edgeless-mode React surface definition. */
export const edgelessSurface: Surface = {
  type: "edgeless",
  component: EdgelessSurface,
};
