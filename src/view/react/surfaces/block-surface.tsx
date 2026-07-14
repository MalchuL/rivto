import { createElement, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import { RIVTO_BLOCK_CONTENT_SELECTOR, RIVTO_SELECTION_RECT_CLASS, blockIdsInRect, clearNativeSelection, type SelectionRect } from "../selection";
import type { Surface, SurfaceRenderProps } from "../editor/types";
import { flattenBlocks, renderBlock } from "./render-block";

function selectionRectStyle(rect: SelectionRect, root: HTMLElement | null) {
  return {
    left: rect.left - (root?.getBoundingClientRect().left ?? 0),
    top: rect.top - (root?.getBoundingClientRect().top ?? 0),
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Renders root blocks as a vertical document tree.
 *
 * The surface owns document-level interaction: block range selection, blank
 * area rectangle selection, and block-keyboard movement. Text selection remains
 * in SelectionBridge because it is shared by every surface.
 */
export function BlockSurface(props: SurfaceRenderProps): ReactNode {
  const page = useRef<HTMLDivElement>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const blocks = props.editor.getBlocks();
  const visibleBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);
  const visibleBlockIds = useMemo(() => visibleBlocks.map((block) => block.id), [visibleBlocks]);

  const selectBlock = (blockId: string, extend: boolean): void => {
    const current = props.editor.selection.get();
    const anchor = extend && current?.type === "block" ? current.anchorBlockId : blockId;
    const anchorIndex = visibleBlockIds.indexOf(anchor);
    const focusIndex = visibleBlockIds.indexOf(blockId);
    const blockIds = anchorIndex < 0 || focusIndex < 0
      ? [blockId]
      : visibleBlockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1);
    props.editor.execute("selection.set", {
      selection: { type: "block", blockIds, anchorBlockId: anchor, focusBlockId: blockId },
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const selection = props.editor.selection.get();
    if (selection?.type !== "block") return;
    if (event.key === "Tab") {
      event.preventDefault();
      props.editor.execute(event.shiftKey ? "block.outdent" : "block.indent", { id: selection.focusBlockId });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.editor.execute("selection.clear");
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      selection.blockIds.forEach((id) => props.editor.removeBlock(id));
      props.editor.execute("selection.clear");
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const focusIndex = visibleBlockIds.indexOf(selection.focusBlockId);
    const next = visibleBlockIds[focusIndex + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) selectBlock(next, event.shiftKey);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.focus({ preventScroll: true });
    dragStart.current = { x: event.clientX, y: event.clientY };
    props.editor.execute("selection.clear");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    const root = page.current;
    if (!start || !root || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
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
    if (!blockIds.length) props.editor.execute("selection.clear");
    else props.editor.execute("selection.set", {
      selection: {
        type: "block",
        blockIds,
        anchorBlockId: event.clientY < start.y ? blockIds.at(-1)! : blockIds[0]!,
        focusBlockId: event.clientY < start.y ? blockIds[0]! : blockIds.at(-1)!,
      },
    });
  };

  const onPointerUp = (): void => {
    dragStart.current = null;
    setSelectionRect(null);
  };

  return createElement(
    "div",
    {
      ref: page,
      "data-rivto-surface-content": "block",
      tabIndex: 0,
      onKeyDown,
      onPointerDownCapture: onPointerDown,
      onPointerMoveCapture: onPointerMove,
      onPointerUpCapture: onPointerUp,
      onClick(event: ReactPointerEvent<HTMLDivElement>) {
        const target = event.target instanceof Element ? event.target : null;
        const content = target?.closest(RIVTO_BLOCK_CONTENT_SELECTOR);
        if (content) return;
      },
    },
    selectionRect && createElement("div", {
      className: RIVTO_SELECTION_RECT_CLASS,
      style: selectionRectStyle(selectionRect, page.current),
    }),
    blocks.map((block: EditorBlock) => renderBlock(block, props, "block")),
  );
}

/** Default block-mode React surface definition. */
export const blockSurface: Surface = {
  type: "block",
  component: BlockSurface,
};
