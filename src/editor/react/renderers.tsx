import { type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Block } from "../../store/document-model";
import type { SlashItem } from "../blocks";
import type { EditorPosition, EditorSelection, RivtoEditorCore } from "../editor";
import { escapeHtml, markdownHtml, markdownType } from "./markdown";
import { readDOMPointPosition, readDOMSelectionPoint, restoreEditorSelection, updateCrossBlockHighlight, type DOMSelectionPoint } from "./selection";
import type { EditorRendererProps, SlashState } from "./types";

/** Renders and synchronizes one block's editable Markdown source. */
function EditableText({ block, title, editor, defaultBlockType, onSlash }: {
  block: Block;
  title: string;
  editor: RivtoEditorCore;
  defaultBlockType: string;
  onSlash: (blockId: string, query: string | null) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const html = editing ? escapeHtml(block.content).replace(/\n/g, "<br>") : markdownHtml(block.content);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (document.activeElement === element) {
      // Native typing changes the DOM before onInput updates the document, so
      // equal text must be left untouched or every keystroke would reset the
      // caret. Programmatic paste and remote CRDT updates change the document
      // first; a mismatch identifies exactly those cases and refreshes the
      // focused host immediately instead of waiting for blur/refocus.
      const visibleText = element.innerText.replace(/\n$/, "");
      if (visibleText !== block.content) element.textContent = block.content;
    } else if (element.innerHTML !== html) element.innerHTML = html;
  }, [block.content, html]);
  return <span ref={ref} className="rv-block-content" contentEditable suppressContentEditableWarning role="textbox" aria-label={title}
    onFocus={(event) => { if (!editing) event.currentTarget.textContent = block.content; setEditing(true); }}
    onBlur={() => setEditing(false)}
    onInput={(event) => {
      const text = event.currentTarget.innerText.replace(/\n$/, "");
      editor.setBlockText(block.id, text);
      onSlash(block.id, text.startsWith("/") ? text.slice(1) : null);
    }}
    onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo(); else editor.undo();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const id = editor.insertBlock({ type: defaultBlockType }, block.id);
        editor.focus(id);
      } else if (event.key === "Backspace" && block.content === "") {
        event.preventDefault();
        editor.removeBlock(block.id);
      } else if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) editor.outdentBlock(block.id); else editor.indentBlock(block.id);
      }
    }} />;
}

/** Resolves one block definition and renders its editable or media content. */
function BlockContent({ block, editor, defaultBlockType, onSlash }: {
  block: Block;
  editor: RivtoEditorCore;
  defaultBlockType: string;
  onSlash: (blockId: string, query: string | null) => void;
}) {
  const definition = editor.blocks.get(block.type);
  if (!definition) return <div className="rv-unknown" contentEditable={false}>Unknown block type: {block.type}</div>;
  if (block.type === "divider") return <hr className="rv-divider" contentEditable={false} />;
  if (block.type === "image" || block.type === "file") {
    const url = String(block.props.url ?? "");
    return <div className="rv-media" contentEditable={false}>
      {block.type === "image" && url && <img src={url} alt={String(block.props.alt ?? "")} />}
      {block.type === "file" && url && <a href={url}>{String(block.props.name ?? url)}</a>}
      <input aria-label={`${block.type} URL`} placeholder={`${block.type} URL`} value={url}
        onChange={(event) => editor.setBlockProp(block.id, "url", event.target.value)} />
    </div>;
  }
  const prefix = block.type === "bulletListItem" ? "•" : block.type === "numberedListItem" ? "1." : block.type === "checkListItem" ? "☐" : "";
  const content = <>{prefix && <span className="rv-prefix" contentEditable={false}>{prefix}</span>}
    <EditableText block={block} title={definition.title ?? block.type} editor={editor} defaultBlockType={defaultBlockType} onSlash={onSlash} /></>;
  return definition.render ? <definition.render block={block} editor={editor} content={content} /> : content;
}

/** Renders slash actions and replaces the trigger block through remove-and-insert. */
function SlashMenu({ editor, blockId, items, close }: { editor: RivtoEditorCore; blockId: string; items: SlashItem[]; close: () => void }) {
  return <div className="rv-menu" role="menu" contentEditable={false}>
    {items.length === 0 ? <p>No matching blocks</p> : items.map((item) =>
      <button key={`${item.group}-${item.title}`} role="menuitem" onMouseDown={(event) => {
        event.preventDefault();
        if (item.run) item.run(editor, blockId);
        else if (item.block) {
          const id = editor.insertBlock({ ...item.block, content: "" }, blockId);
          editor.removeBlock(blockId);
          editor.focus(id);
        }
        close();
      }}>{item.title}</button>)}
  </div>;
}

/** Renders one block recursively for page mode or absolutely for edgeless mode. */
function BlockView({ block, editor, defaultBlockType, slash, setSlash, canvas = false, selected, select }: {
  block: Block;
  editor: RivtoEditorCore;
  defaultBlockType: string;
  slash: SlashState | null;
  setSlash: (value: SlashState | null) => void;
  canvas?: boolean;
  selected?: boolean;
  select?: () => void;
}) {
  const layout = block.layout ?? { x: 40, y: 40, width: 320, height: 120, zIndex: 0 };
  const style: CSSProperties | undefined = canvas ? { left: layout.x, top: layout.y, width: layout.width, minHeight: layout.height, zIndex: layout.zIndex } : undefined;
  const items = useMemo(() => {
    const query = slash?.query.toLowerCase() ?? "";
    return editor.getSlashItems().filter((item) => [item.title, ...(item.aliases ?? [])].some((term) => term.toLowerCase().includes(query)));
  }, [editor, editor.revision, slash?.query]);
  const drag = (event: ReactPointerEvent): void => {
    if (!canvas) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: layout.x, top: layout.y };
    const move = (next: PointerEvent): void => editor.setBlockLayout(block.id, { x: start.left + next.clientX - start.x, y: start.top + next.clientY - start.y });
    const stop = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const resize = (event: ReactPointerEvent): void => {
    event.preventDefault(); event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, width: layout.width, height: layout.height };
    const move = (next: PointerEvent): void => editor.setBlockLayout(block.id, { width: Math.max(180, start.width + next.clientX - start.x), height: Math.max(70, start.height + next.clientY - start.y) });
    const stop = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  return <div className={canvas ? "rv-block rv-canvas-block" : "rv-block"} data-rivto-block={block.id}
    data-type={markdownType(block)} data-selected={selected} style={style} onClick={select}
    onDragOver={(event) => { if (!canvas) event.preventDefault(); }}
    onDrop={(event) => { if (!canvas) { event.preventDefault(); const source = event.dataTransfer.getData("application/x-rivto-block"); if (source && source !== block.id) editor.moveBlock(source, block.id); } }}
    tabIndex={canvas ? 0 : undefined}
    onKeyDown={(event) => {
      if (!canvas || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || (event.target as HTMLElement).isContentEditable) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      editor.setBlockLayout(block.id, { x: layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y: layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) });
    }}>
    {!canvas && <div className="rv-side" aria-label="Block controls" contentEditable={false}>
      <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-rivto-block", block.id)} aria-label="Drag block">⋮</button>
      <button onClick={() => editor.insertBlock({ type: defaultBlockType }, block.id)} aria-label="Add block below">＋</button>
      <button onClick={() => editor.indentBlock(block.id)} aria-label="Indent block">→</button>
      <button onClick={() => editor.outdentBlock(block.id)} aria-label="Outdent block">←</button>
      <button onClick={() => editor.removeBlock(block.id)} aria-label="Delete block">×</button>
    </div>}
    {canvas && <div className="rv-drag" onPointerDown={drag}>Drag block</div>}
    <BlockContent block={block} editor={editor} defaultBlockType={defaultBlockType}
      onSlash={(blockId, query) => setSlash(query === null ? null : { blockId, query })} />
    {slash?.blockId === block.id && <SlashMenu editor={editor} blockId={block.id} items={items} close={() => setSlash(null)} />}
    {!canvas && block.children.length > 0 && <div className="rv-children">{block.children.map((child) =>
      <BlockView key={child.id} block={child} editor={editor} defaultBlockType={defaultBlockType} slash={slash} setSlash={setSlash} />)}</div>}
    {canvas && <button className="rv-resize" onPointerDown={resize} aria-label="Resize block" />}
  </div>;
}

/** Renders ordered block trees in document flow. */
export function BlockDOMRenderer({ editor, blocks, defaultBlockType, slash, setSlash }: EditorRendererProps) {
  const page = useRef<HTMLDivElement>(null);
  const pointerSelection = useRef<{
    anchorPosition?: EditorPosition;
    anchor?: DOMSelectionPoint;
    selection?: EditorSelection;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    /** Extends an active gesture when the pointer enters another block editing host. */
    const move = (event: PointerEvent): void => {
      const root = page.current;
      const start = pointerSelection.current;
      if (!root || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
      const anchor = start.anchor ?? readDOMSelectionPoint(root, start.x, start.y);
      if (!anchor) return;
      start.anchor = anchor;
      const head = readDOMSelectionPoint(root, event.clientX, event.clientY);
      if (!head) return;
      const anchorPosition = start.anchorPosition ?? readDOMPointPosition(root, anchor);
      const headPosition = readDOMPointPosition(root, head);
      if (!anchorPosition || !headPosition || anchorPosition.blockId === headPosition.blockId) return;
      event.preventDefault();
      // Tell the outer React binding that this renderer currently owns the
      // portable cross-host selection. Native selectionchange events emitted
      // during Chromium's drag describe only its active host and must not
      // overwrite the correct anchor/head below.
      root.dataset.rivtoPointerSelecting = "true";
      // Native selectionchange is asynchronous and, for a bottom-to-top drag,
      // some engines do not publish or paint the cross-host range until mouseup.
      // Publish the already-resolved pointer endpoints immediately so React's
      // CSS Highlight layer updates during the gesture. Using the original
      // anchor/head also keeps reverse direction even though Range normalizes it.
      const directedSelection = { anchor: anchorPosition, head: headPosition };
      start.selection = directedSelection;
      editor.setSelection(directedSelection);
      // Chromium can defer React's external-store commit while its native
      // selection gesture is active. Paint from the same portable value now;
      // RivtoEditor will reconcile the identical highlight after the commit.
      updateCrossBlockHighlight(root, directedSelection);
    };
    /** Ends pointer selection without changing the resulting native range. */
    const stop = (): void => {
      const completed = pointerSelection.current;
      pointerSelection.current = null;
      const root = page.current;
      // During the drag, CSS Highlight is authoritative because Chromium's
      // native range can collapse to the active host. Once pointer ownership is
      // released, restore the browser range from stable editor coordinates so
      // copy/cut and keyboard extension continue from the visible selection.
      if (root && completed?.selection) setTimeout(() => {
        restoreEditorSelection(root, completed.selection ?? null);
        delete root.dataset.rivtoPointerSelecting;
      });
      else if (root) delete root.dataset.rivtoPointerSelecting;
    };
    // Chromium can withhold mousemove while it owns a native text-selection
    // drag. Pointer events continue through that gesture in both Chromium and
    // Firefox, so the bridge can render reverse selection before pointerup.
    window.addEventListener("pointermove", move, { passive: false, capture: true });
    window.addEventListener("pointerup", stop, true);
    return () => {
      if (page.current) delete page.current.dataset.rivtoPointerSelecting;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
    };
  }, [editor]);
  return <div ref={page} className="rv-page"
    onPointerDownCapture={(event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(".rv-block-content") : null;
      const root = page.current;
      const anchor = target && root ? readDOMSelectionPoint(root, event.clientX, event.clientY) : undefined;
      // Store the portable anchor before native contenteditable handling runs.
      // Chromium may later report the current head for a hit-test at the old
      // coordinates; the stable block/offset remains valid across DOM rewrites.
      const anchorPosition = root && anchor ? readDOMPointPosition(root, anchor) : undefined;
      pointerSelection.current = target ? { anchorPosition, x: event.clientX, y: event.clientY } : null;
    }}>
    {blocks.map((block) => <BlockView key={block.id} block={block} editor={editor} defaultBlockType={defaultBlockType} slash={slash} setSlash={setSlash} />)}
  </div>;
}

/** Renders the same blocks on a scalable absolute-positioned DOM plane. */
export function EdgelessCanvasRenderer({ editor, blocks, defaultBlockType, slash, setSlash, selected, setSelected, zoom }: EditorRendererProps) {
  return <div className="rv-canvas"><div className="rv-plane" style={{ transform: `scale(${zoom})` }}>
    <svg className="rv-links" width="2400" height="1600" aria-hidden="true">{editor.links.map((link) => {
      const from = blocks.find((block) => block.id === link.from.blockId)?.layout;
      const to = blocks.find((block) => block.id === link.to.blockId)?.layout;
      return from && to ? <line key={link.id} x1={from.x + from.width / 2} y1={from.y + from.height / 2}
        x2={to.x + to.width / 2} y2={to.y + to.height / 2} stroke="currentColor" strokeWidth="2" /> : null;
    })}</svg>
    {blocks.map((block) => <BlockView key={block.id} block={block} editor={editor} defaultBlockType={defaultBlockType}
      slash={slash} setSlash={setSlash} canvas selected={selected === block.id} select={() => setSelected(block.id)} />)}
  </div></div>;
}
