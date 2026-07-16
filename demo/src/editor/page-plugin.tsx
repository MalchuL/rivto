import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState, type PointerEvent, type PropsWithChildren } from "react";
import { RIVTO_BLOCK_ATTR, blockIdsInRect, clearNativeSelection, useEditor, useEditorRevision, useEditorRoot, type EditorBlock, type ViewPlugin, type ViewPluginBlockProps } from "@chulane/rivto";

function flatten(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.flatMap((block) => [block, ...flatten(block.children)]);
}

function PagePluginView({ children }: PropsWithChildren) {
  const editor = useEditor();
  const root = useEditorRoot();
  useEditorRevision();
  const blocks = flatten(editor.getBlocks());
  const ids = useMemo(() => blocks.map(({ id }) => id), [blocks]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const start = useRef<{ x: number; y: number } | null>(null);
  const pending = useRef<string[]>([]);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState<string[]>([]);

  const select = (id: string, shift = false, toggle = false): void => {
    const current = editor.selection.get();
    if (toggle && current?.type === "block") {
      const blockIds = current.blockIds.includes(id) ? current.blockIds.filter((value) => value !== id) : [...current.blockIds, id];
      if (!blockIds.length) return editor.execute("selection.clear") as void;
      editor.execute("selection.set", { selection: { type: "block", blockIds, anchorBlockId: blockIds[0], focusBlockId: id } });
      return;
    }
    const anchor = shift && current?.type === "block" ? current.anchorBlockId : id;
    const range = ids.slice(Math.min(ids.indexOf(anchor), ids.indexOf(id)), Math.max(ids.indexOf(anchor), ids.indexOf(id)) + 1);
    editor.execute("selection.set", { selection: { type: "block", blockIds: range, anchorBlockId: anchor, focusBlockId: id } });
  };

  const dragEnd = ({ active, over, delta }: DragEndEvent): void => {
    const activeId = String(active.id);
    const overId = over && String(over.id);
    const group = dragging.length ? dragging : [activeId];
    setDragging([]);
    if (overId && overId !== activeId && !group.includes(overId)) {
      let previous: string | null = overId;
      group.forEach((id) => { editor.moveBlock(id, previous); previous = id; });
    }
    if (group.length === 1 && delta.x > 32) editor.indentBlock(activeId);
    if (group.length === 1 && delta.x < -32) editor.outdentBlock(activeId);
    select(activeId);
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(`[${RIVTO_BLOCK_ATTR}],.rv-block-handle`))) return;
    start.current = { x: event.clientX, y: event.clientY };
    editor.execute("selection.clear");
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!start.current || !root.current) return;
    const next = { left: Math.min(start.current.x, event.clientX), top: Math.min(start.current.y, event.clientY), width: Math.abs(event.clientX - start.current.x), height: Math.abs(event.clientY - start.current.y) };
    if (next.width + next.height < 4) return;
    clearNativeSelection(root.current);
    setRect(next);
    const blockIds = blockIdsInRect(root.current, next);
    pending.current = blockIds;
    if (blockIds.length) editor.execute("selection.set", { selection: { type: "block", blockIds, anchorBlockId: blockIds[0], focusBlockId: blockIds.at(-1) } });
  };
  const pointerUp = (): void => {
    const blockIds = pending.current;
    start.current = null;
    pending.current = [];
    setRect(null);
    if (blockIds.length) requestAnimationFrame(() => editor.execute("selection.set", {
      selection: { type: "block", blockIds, anchorBlockId: blockIds[0], focusBlockId: blockIds.at(-1) },
    }));
  };

  return (
    <div data-rivto-selection-field="block" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
      {rect && <div className="rv-selection-rect" style={{ position: "fixed", ...rect }} />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => {
        const selection = editor.selection.get();
        setDragging(selection?.type === "block" && selection.blockIds.includes(String(active.id)) ? selection.blockIds : [String(active.id)]);
      }} onDragEnd={dragEnd} onDragCancel={() => setDragging([])}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
        {dragging.length > 1 && <DragOverlay><div className="rv-drag-overlay">Blocks (+{dragging.length - 1})</div></DragOverlay>}
      </DndContext>
    </div>
  );
}

function SortableBlock({ block, children }: ViewPluginBlockProps) {
  const editor = useEditor();
  const sortable = useSortable({ id: block.id });
  return <div ref={sortable.setNodeRef} className="rv-block-frame" style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>
    <button type="button" className="rv-block-handle" aria-label="Drag block" {...sortable.attributes} {...sortable.listeners} onClick={(event) => {
      if (sortable.isDragging) return;
      window.getSelection()?.removeAllRanges();
      const selection = editor.selection.get();
      const ids = flatten(editor.getBlocks()).map(({ id }) => id);
      const anchor = event.shiftKey && selection?.type === "block" ? selection.anchorBlockId : block.id;
      let blockIds = ids.slice(Math.min(ids.indexOf(anchor), ids.indexOf(block.id)), Math.max(ids.indexOf(anchor), ids.indexOf(block.id)) + 1);
      if ((event.metaKey || event.ctrlKey) && selection?.type === "block") blockIds = selection.blockIds.includes(block.id) ? selection.blockIds.filter((id) => id !== block.id) : [...selection.blockIds, block.id];
      if (blockIds.length) editor.execute("selection.set", { selection: { type: "block", blockIds, anchorBlockId: anchor, focusBlockId: block.id } });
      else editor.execute("selection.clear");
      event.stopPropagation();
    }} />
    {children}
  </div>;
}

export const pagePlugin: ViewPlugin = { id: "demo.page", View: PagePluginView, Block: SortableBlock };
