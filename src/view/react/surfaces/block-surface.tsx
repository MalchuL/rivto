import { createElement, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditorBlock } from "../../../editor/model";
import { RIVTO_BLOCK_CONTENT_SELECTOR, RIVTO_BLOCK_SELECTOR, blockIdsInRect, clearNativeSelection, type SelectionRect } from "../selection";
import type { Surface, SurfaceRenderProps } from "../editor/types";
import { BlockShell } from "../blocks/block-shell";
import { SelectionRectangle } from "../selection/selection-rect";

interface VisibleBlock {
  block: EditorBlock;
  depth: number;
}

function flattenVisibleBlocks(blocks: EditorBlock[], depth = 0): VisibleBlock[] {
  return blocks.flatMap((block) => [
    { block, depth },
    ...flattenVisibleBlocks(block.children, depth + 1),
  ]);
}

function indexParents(blocks: EditorBlock[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

function topLevelSelectedIds(blocks: EditorBlock[], selectedIds: string[], visibleBlockIds: string[]): string[] {
  const selected = new Set(selectedIds);
  const parents = indexParents(blocks);
  return selectedIds
    .filter((id) => {
      let parent = parents.get(id);
      while (parent) {
        if (selected.has(parent)) return false;
        parent = parents.get(parent);
      }
      return true;
    })
    .sort((a, b) => visibleBlockIds.indexOf(a) - visibleBlockIds.indexOf(b));
}

interface SortableBlockShellProps {
  block: EditorBlock;
  depth: number;
  props: SurfaceRenderProps;
  selectedIds: string[];
  multiDragging: boolean;
  captureDragGroup(blockId: string): void;
  selectBlock(blockId: string, options?: { extend?: boolean; toggle?: boolean }): void;
}

function SortableBlockShell({ block, depth, props, selectedIds, multiDragging, captureDragGroup, selectBlock }: SortableBlockShellProps): ReactNode {
  const sortable = useSortable({ id: block.id });
  const style = {
    transform: multiDragging ? undefined : CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    marginLeft: depth * 24,
  };
  const renderChild = (child: EditorBlock): ReactNode => createElement(SortableBlockShell, {
    key: child.id,
    block: child,
    depth: depth + 1,
    props,
    selectedIds,
    multiDragging,
    captureDragGroup,
    selectBlock,
  });

  return createElement(BlockShell, {
    block,
    editor: props.editor,
    surface: "block",
    renderProps: props,
    selected: selectedIds.includes(block.id),
    style,
    shellProps: {
      ref: sortable.setNodeRef,
    },
    handleProps: {
      ...sortable.attributes,
      ...sortable.listeners,
      onPointerDownCapture() {
        captureDragGroup(block.id);
      },
      onPointerUp(event) {
        if (sortable.isDragging) return;
        selectBlock(block.id, { extend: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
      },
      onClick(event) {
        event.preventDefault();
        event.stopPropagation();
      },
    },
    renderChild,
  });
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
  const [pendingSelectedIds, setPendingSelectedIds] = useState<string[]>([]);
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragGroup = useRef<string[] | null>(null);
  const pendingSelection = useRef<string[]>([]);
  const blocks = props.editor.getBlocks();
  const visibleBlocks = useMemo(() => flattenVisibleBlocks(blocks), [blocks]);
  const visibleBlockIds = useMemo(() => visibleBlocks.map((item) => item.block.id), [visibleBlocks]);
  const currentSelection = props.editor.selection.get();
  const selectedIds = pendingSelectedIds.length
    ? pendingSelectedIds
    : currentSelection?.type === "block" ? currentSelection.blockIds : [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const selectBlock = (blockId: string, options: { extend?: boolean; toggle?: boolean } = {}): void => {
    const current = props.editor.selection.get();
    if (options.toggle && current?.type === "block") {
      const next = current.blockIds.includes(blockId)
        ? current.blockIds.filter((id) => id !== blockId)
        : [...current.blockIds, blockId].sort((a, b) => visibleBlockIds.indexOf(a) - visibleBlockIds.indexOf(b));
      if (!next.length) {
        props.editor.execute("selection.clear");
        return;
      }
      const focusBlockId = next.includes(blockId) ? blockId : next.at(-1)!;
      props.editor.execute("selection.set", {
        selection: { type: "block", blockIds: next, anchorBlockId: next[0]!, focusBlockId },
      });
      return;
    }
    const anchor = options.extend && current?.type === "block" ? current.anchorBlockId : blockId;
    const anchorIndex = visibleBlockIds.indexOf(anchor);
    const focusIndex = visibleBlockIds.indexOf(blockId);
    const blockIds = anchorIndex < 0 || focusIndex < 0
      ? [blockId]
      : visibleBlockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1);
    props.editor.execute("selection.set", {
      selection: { type: "block", blockIds, anchorBlockId: anchor, focusBlockId: blockId },
    });
  };

  const captureDragGroup = (blockId: string): void => {
    const selection = props.editor.selection.get();
    dragGroup.current = selection?.type === "block" && selection.blockIds.includes(blockId)
      ? topLevelSelectedIds(blocks, selection.blockIds, visibleBlockIds)
      : [blockId];
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
    if (next) selectBlock(next, { extend: event.shiftKey });
  };

  const onDragStart = (event: DragStartEvent): void => {
    const activeId = String(event.active.id);
    const selection = props.editor.selection.get();
    dragGroup.current = selection?.type === "block" && selection.blockIds.includes(activeId)
      ? topLevelSelectedIds(blocks, selection.blockIds, visibleBlockIds)
      : [activeId];
    setDraggedIds(dragGroup.current);
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId) {
      dragGroup.current = null;
      setDraggedIds([]);
      return;
    }
    const group = dragGroup.current ?? [activeId];
    dragGroup.current = null;
    setDraggedIds([]);
    const dragged = new Set(group);
    const parents = indexParents(blocks);
    const draggedTree = new Set(visibleBlockIds.filter((id) => {
      let current: string | undefined = id;
      while (current) {
        if (dragged.has(current)) return true;
        current = parents.get(current);
      }
      return false;
    }));
    const activeIndex = visibleBlockIds.indexOf(activeId);
    const overIndex = visibleBlockIds.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0) return;
    if (activeId !== overId && !draggedTree.has(overId)) {
      const withoutDragged = visibleBlockIds.filter((id) => !draggedTree.has(id));
      const targetIndex = withoutDragged.indexOf(overId);
      let previous = activeIndex < overIndex ? overId : withoutDragged[targetIndex - 1] ?? null;
      group.forEach((id) => {
        props.editor.moveBlock(id, previous);
        previous = id;
      });
    }
    if (group.length === 1 && event.delta.x > 32) props.editor.indentBlock(activeId);
    if (group.length === 1 && event.delta.x < -32) props.editor.outdentBlock(activeId);
    if (group.length > 1) {
      props.editor.execute("selection.set", {
        selection: {
          type: "block",
          blockIds: group,
          anchorBlockId: group[0]!,
          focusBlockId: group.at(-1)!,
        },
      });
    } else selectBlock(activeId);
  };

  const cancelDrag = (): void => {
    dragGroup.current = null;
    setDraggedIds([]);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(RIVTO_BLOCK_SELECTOR)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragStart.current = { x: event.clientX, y: event.clientY };
    pendingSelection.current = [];
    setPendingSelectedIds([]);
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
    pendingSelection.current = blockIds;
    setPendingSelectedIds(blockIds);
  };

  const finishRectangleSelection = (): void => {
    const start = dragStart.current;
    if (!start) return;
    const blockIds = pendingSelection.current;
    dragStart.current = null;
    pendingSelection.current = [];
    setPendingSelectedIds([]);
    setSelectionRect(null);
    if (!blockIds.length || !start) {
      props.editor.execute("selection.clear");
      return;
    }
    props.editor.execute("selection.set", {
      selection: {
        type: "block",
        blockIds,
        anchorBlockId: blockIds[0]!,
        focusBlockId: blockIds.at(-1)!,
      },
    });
  };

  useEffect(() => {
    window.addEventListener("pointerup", finishRectangleSelection, true);
    window.addEventListener("pointercancel", finishRectangleSelection, true);
    window.addEventListener("mouseup", finishRectangleSelection, true);
    document.addEventListener("pointerup", finishRectangleSelection, true);
    document.addEventListener("pointercancel", finishRectangleSelection, true);
    document.addEventListener("mouseup", finishRectangleSelection, true);
    return () => {
      window.removeEventListener("pointerup", finishRectangleSelection, true);
      window.removeEventListener("pointercancel", finishRectangleSelection, true);
      window.removeEventListener("mouseup", finishRectangleSelection, true);
      document.removeEventListener("pointerup", finishRectangleSelection, true);
      document.removeEventListener("pointercancel", finishRectangleSelection, true);
      document.removeEventListener("mouseup", finishRectangleSelection, true);
    };
  }, [props.editor]);

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone if the browser cancelled it.
    }
    finishRectangleSelection();
  };

  return createElement(
    "div",
    {
      ref: page,
      "data-rivto-surface-content": "block",
      "data-rivto-selection-field": "block",
      tabIndex: 0,
      style: {
        position: "relative",
        minHeight: 220,
        padding: "16px 32px 0",
        background: "var(--rivto-block-selection-field-background, rgba(90, 142, 232, 0.035))",
      },
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
    selectionRect && createElement(SelectionRectangle, { rect: selectionRect, root: page.current }),
    createElement("div", {
      "data-rivto-selection-column": "block",
      style: {
        width: "min(100%, 760px)",
        margin: "0 auto",
      },
    },
      createElement("div", {
        "data-rivto-selection-blank": "top",
        style: {
          minHeight: 28,
          borderBottom: "1px dashed rgba(90, 142, 232, 0.22)",
        },
      }),
    createElement(DndContext, {
      sensors,
      collisionDetection: closestCenter,
      onDragStart,
      onDragEnd,
      onDragCancel: cancelDrag,
    }, createElement(SortableContext, {
        items: visibleBlockIds,
        strategy: verticalListSortingStrategy,
        children: blocks.map((block: EditorBlock) => createElement(SortableBlockShell, {
          key: block.id,
          block,
          depth: 0,
          props,
          selectedIds,
          multiDragging: draggedIds.length > 1,
          captureDragGroup,
          selectBlock,
        })),
      }), draggedIds.length > 1 && createElement(DragOverlay, null,
        createElement("div", {
          "data-rivto-multi-drag-overlay": "true",
          style: {
            width: 320,
            maxWidth: "70vw",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--rivto-block-selection-field-background, white)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        }, `${visibleBlocks.find(({ block }) => block.id === draggedIds[0])?.block.content ?? "Block"} (+${draggedIds.length - 1})`),
      )),
      createElement("div", {
        "data-rivto-selection-blank": "bottom",
        style: {
          minHeight: 80,
          borderTop: "1px dashed rgba(90, 142, 232, 0.25)",
        },
      }),
    ),
  );
}

/** Default block-mode React surface definition. */
export const blockSurface: Surface = {
  type: "block",
  component: BlockSurface,
};
