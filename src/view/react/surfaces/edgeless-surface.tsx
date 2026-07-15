import { createElement, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import { blockIdsInRect, clearNativeSelection, RIVTO_BLOCK_SELECTOR, type SelectionRect } from "../selection";
import type { Surface, SurfaceRenderProps } from "../editor/types";
import { BlockShell } from "../blocks/block-shell";
import { RIVTO_CANVAS_BLOCK_CLASS, RIVTO_CANVAS_BLOCK_SELECTOR, RIVTO_DRAG_ID_ATTR } from "../blocks/constants";
import { flattenBlocks } from "./render-block";
import { SelectionRectangle } from "../selection/selection-rect";

const DEFAULT_LAYOUT = { x: 0, y: 0, width: 320, height: 120, zIndex: 0 };

function visibleLayout(block: EditorBlock) {
  return { ...DEFAULT_LAYOUT, ...block.layout };
}

function blockElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${RIVTO_CANVAS_BLOCK_SELECTOR}[${RIVTO_DRAG_ID_ATTR}="${CSS.escape(id)}"]`);
}

function setLocalDragOffset(id: string, dx: number, dy: number): void {
  const element = blockElement(id);
  if (element) element.style.transform = `translate(${dx}px, ${dy}px)`;
}

function clearLocalDragOffset(id: string): void {
  const element = blockElement(id);
  if (element) element.style.transform = "";
}

function renderCanvasBlock(block: EditorBlock, props: SurfaceRenderProps, selectedIds: string[]): ReactNode {
  const layout = visibleLayout(block);
  const style: CSSProperties = {
    position: "absolute",
    left: layout.x,
    top: layout.y,
    width: layout.width,
    minHeight: layout.height,
    zIndex: layout.zIndex,
  };
  const moveSelection = (dx: number, dy: number): void => {
    const ids = selectedIds.includes(block.id) ? selectedIds : [block.id];
    flattenBlocks(props.editor.getBlocks())
      .filter((item) => ids.includes(item.id))
      .forEach((item) => {
        const itemLayout = visibleLayout(item);
        props.editor.setBlockLayout(item.id, { x: itemLayout.x + dx, y: itemLayout.y + dy });
      });
  };
  const select = (): void => {
    props.editor.execute("selection.set", { selection: { type: "edgeless", blockIds: [block.id] } });
  };
  const drag = (event: ReactPointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!selectedIds.includes(block.id)) select();
    (event.currentTarget.parentElement as HTMLElement | null)?.focus({ preventScroll: true });
    const ids = selectedIds.includes(block.id) ? selectedIds : [block.id];
    const starts = flattenBlocks(props.editor.getBlocks())
      .filter((item) => ids.includes(item.id))
      .map((item) => ({ id: item.id, layout: visibleLayout(item) }));
    const start = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      starts.forEach((item) => {
        setLocalDragOffset(item.id, dx, dy);
      });
    };
    const stop = (next: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      starts.forEach((item) => {
        clearLocalDragOffset(item.id);
        if (dx || dy) props.editor.setBlockLayout(item.id, { x: item.layout.x + dx, y: item.layout.y + dy });
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.isContentEditable) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    moveSelection(
      event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
      event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
    );
  };
  return createElement(
    BlockShell,
    {
      key: block.id,
      block,
      editor: props.editor,
      surface: "edgeless",
      renderProps: props,
      selected: selectedIds.includes(block.id),
      className: RIVTO_CANVAS_BLOCK_CLASS,
      style,
      shellProps: {
        [RIVTO_DRAG_ID_ATTR]: block.id,
        "data-selected": selectedIds.includes(block.id) ? "true" : undefined,
        tabIndex: 0,
        onKeyDown: keyDown,
      },
      handleProps: { onPointerDown: drag },
    },
  );
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
  const [pendingSelectedIds, setPendingSelectedIds] = useState<string[]>([]);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pendingSelection = useRef<string[]>([]);
  const blocks = props.editor.getBlocks();
  const selection = props.editor.selection.get();
  const selectedIds = pendingSelectedIds.length ? pendingSelectedIds : selection?.type === "edgeless" ? selection.blockIds : [];

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(`${RIVTO_BLOCK_SELECTOR},${RIVTO_CANVAS_BLOCK_SELECTOR}`)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    dragStart.current = { x: event.clientX, y: event.clientY };
    pendingSelection.current = [];
    setPendingSelectedIds([]);
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
    pendingSelection.current = blockIds;
    setPendingSelectedIds(blockIds);
  };

  const onPointerUp = (): void => {
    const blockIds = pendingSelection.current;
    dragStart.current = null;
    pendingSelection.current = [];
    setSelectionRect(null);
    setPendingSelectedIds([]);
    if (blockIds.length) props.editor.execute("selection.set", { selection: { type: "edgeless", blockIds } });
    else props.editor.execute("selection.clear");
  };

  return createElement(
    "div",
    {
      ref: canvas,
      "data-rivto-surface-content": "edgeless",
      className: "rv-canvas",
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
    blocks.map((block) => renderCanvasBlock(block, props, selectedIds)),
    selectionRect && createElement(SelectionRectangle, { rect: selectionRect, root: canvas.current }),
  );
}

/** Default edgeless-mode React surface definition. */
export const edgelessSurface: Surface = {
  type: "edgeless",
  component: EdgelessSurface,
};
