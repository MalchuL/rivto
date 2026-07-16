import { useRef, useState, type KeyboardEvent, type PointerEvent, type PropsWithChildren } from "react";
import { RIVTO_BLOCK_ATTR, blockIdsInRect, clearNativeSelection, useEditor, useEditorRevision, useEditorRoot, type EditorBlockLayout, type ViewPlugin, type ViewPluginBlockProps } from "@chulane/rivto";

const fallback: EditorBlockLayout = { x: 40, y: 40, width: 320, height: 120, zIndex: 0 };

function EdgelessView({ children }: PropsWithChildren) {
  const editor = useEditor();
  const root = useEditorRoot();
  useEditorRevision();
  const start = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!event.key.startsWith("Arrow") || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const selection = editor.selection.get();
    if (selection?.type !== "edgeless") return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    selection.blockIds.forEach((id) => {
      const layout = { ...fallback, ...editor.getBlock(id)?.layout };
      editor.setBlockLayout(id, {
        x: layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
        y: layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
      });
    });
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (!start.current || !root.current) return;
    const next = { left: Math.min(start.current.x, event.clientX), top: Math.min(start.current.y, event.clientY), width: Math.abs(event.clientX - start.current.x), height: Math.abs(event.clientY - start.current.y) };
    if (next.width + next.height < 4) return;
    clearNativeSelection(root.current);
    setRect(next);
    const blockIds = blockIdsInRect(root.current, next);
    if (blockIds.length) editor.execute("selection.set", { selection: { type: "edgeless", blockIds } });
  };
  return <div className="rv-canvas-interactions" tabIndex={0} onKeyDown={keyDown} onPointerDown={(event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(`[${RIVTO_BLOCK_ATTR}]`))) return;
    start.current = { x: event.clientX, y: event.clientY };
    editor.execute("selection.clear");
  }} onPointerMove={move} onPointerUp={() => { start.current = null; setRect(null); }}>
    {rect && <div className="rv-selection-rect" style={{ position: "fixed", ...rect }} />}
    {children}
  </div>;
}

function CanvasBlock({ block, children }: ViewPluginBlockProps) {
  const editor = useEditor();
  const layout = { ...fallback, ...block.layout };
  const drag = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = editor.selection.get();
    const ids = selection?.type === "edgeless" && selection.blockIds.includes(block.id) ? selection.blockIds : [block.id];
    if (!ids.includes(block.id) || selection?.type !== "edgeless") editor.execute("selection.set", { selection: { type: "edgeless", blockIds: ids } });
    const starts = ids.map((id) => ({ id, layout: { ...fallback, ...editor.getBlock(id)?.layout } }));
    const origin = { x: event.clientX, y: event.clientY };
    const move = (next: globalThis.PointerEvent): void => {
      starts.forEach(({ id }) => {
        const element = document.querySelector<HTMLElement>(`[data-canvas-id="${CSS.escape(id)}"]`);
        if (element) element.style.transform = `translate(${next.clientX - origin.x}px, ${next.clientY - origin.y}px)`;
      });
    };
    const stop = (next: globalThis.PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      starts.forEach(({ id, layout }) => {
        const element = document.querySelector<HTMLElement>(`[data-canvas-id="${CSS.escape(id)}"]`);
        if (element) element.style.transform = "";
        editor.setBlockLayout(id, { x: layout.x + next.clientX - origin.x, y: layout.y + next.clientY - origin.y });
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return <div className="rv-canvas-block" data-canvas-id={block.id} tabIndex={0} style={{ position: "absolute", left: layout.x, top: layout.y, width: layout.width, minHeight: layout.height, zIndex: layout.zIndex }}>
    <button type="button" className="rv-block-handle" aria-label="Drag block" onPointerDown={drag} />
    {children}
  </div>;
}

export const edgelessPlugin: ViewPlugin = { id: "demo.edgeless", View: EdgelessView, Block: CanvasBlock };
