import { type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Block } from "../../store/document-model";
import type { EditorPosition, EditorSelection, EditorRuntime } from "../editor";
import { getSlashMenuPlugin, slashItemId, type SlashItem, type SlashMenuState } from "../plugins";
import { escapeHtml, markdownHtml, markdownType } from "./markdown";
import { blockIdsInRect, clearNativeSelection, readDOMPointPosition, readDOMSelectionPoint, restoreEditorSelection, setNativeSelection, updateCrossBlockHighlight, type DOMSelectionPoint, type SelectionRect } from "./selection";
import type { EditorRendererProps } from "./types";

/** Renders and synchronizes one block's editable Markdown source. */
function EditableText({ block, title, editor, defaultBlockType }: {
  block: Block;
  title: string;
  editor: EditorRuntime;
  defaultBlockType: string;
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
  return <span ref={ref} className="rv-block-content" data-placeholder="Type / for commands" contentEditable suppressContentEditableWarning role="textbox" aria-label={title}
    onFocus={(event) => { if (!editing) event.currentTarget.textContent = block.content; setEditing(true); }}
    onBlur={() => setEditing(false)}
    onInput={(event) => {
      const text = event.currentTarget.innerText.replace(/\n$/, "");
      editor.commands.execute("text.set", { id: block.id, text });
      editor.events.dispatch({ type: "input", blockId: block.id, payload: { text } });
    }}
    onBeforeInput={(event) => {
      const selection = editor.selection.get();
      const native = event.nativeEvent as InputEvent;
      if (native.isComposing || selection?.type !== "text" || selection.anchor.blockId === selection.head.blockId) return;
      // Native contenteditable cannot atomically replace a range spanning
      // independent hosts. BlockSuite intercepts this same boundary: preserve
      // the first prefix and final suffix, remove the covered middle blocks,
      // then collapse after the inserted text through the command path.
      if (!native.inputType.startsWith("insert") && !native.inputType.startsWith("delete")) return;
      event.preventDefault();
      const text = native.inputType.startsWith("insert") ? native.data ?? "" : "";
      void editor.commands.execute("clipboard.paste", { defaultBlockType, text });
    }}
    onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
      const handled = editor.events.dispatch({
        type: "keydown", blockId: block.id, key: event.key, shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        payload: { defaultBlockType, empty: block.content === "" },
      });
      if (handled) {
        event.preventDefault();
        return;
      }
      const selection = editor.selection.get();
      const replacesCrossBlockRange = selection?.type === "text"
        && selection.anchor.blockId !== selection.head.blockId
        && ((!event.metaKey && !event.ctrlKey && event.key.length === 1)
          || event.key === "Backspace" || event.key === "Delete");
      if (replacesCrossBlockRange) {
        event.preventDefault();
        const text = event.key.length === 1 ? event.key : "";
        void editor.commands.execute("clipboard.paste", { defaultBlockType, text });
      }
    }} />;
}

/** Resolves one block definition and renders its editable or media content. */
function BlockContent({ block, editor, defaultBlockType }: {
  block: Block;
  editor: EditorRuntime;
  defaultBlockType: string;
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
        onChange={(event) => editor.commands.execute("block.prop.set", { id: block.id, key: "url", value: event.target.value })} />
    </div>;
  }
  const prefix = block.type === "bulletListItem" ? "•" : block.type === "numberedListItem" ? "1." : block.type === "checkListItem" ? "☐" : "";
  const content = <>{prefix && <span className="rv-prefix" contentEditable={false}>{prefix}</span>}
    <EditableText block={block} title={definition.title ?? block.type} editor={editor} defaultBlockType={defaultBlockType} /></>;
  const Renderer = editor.blocks.getRenderer(block.type, editor.mode.get());
  return Renderer ? <Renderer block={block} editor={editor} content={content} /> : content;
}

/** Renders slash actions and replaces the trigger block through remove-and-insert. */
function SlashMenu({ editor, blockId, items }: { editor: EditorRuntime; blockId: string; items: SlashItem[] }) {
  return <div className="rv-menu" role="menu" contentEditable={false}>
    {items.length === 0 ? <p>No matching blocks</p> : items.map((item) =>
      <button key={slashItemId(item)} role="menuitem" onMouseDown={(event) => {
        event.preventDefault();
        editor.commands.execute<Record<string, (payload: unknown) => unknown>>("slash.execute", { blockId, itemId: slashItemId(item) });
      }}>{item.title}</button>)}
  </div>;
}

/** Renders one block recursively for page mode or absolutely for edgeless mode. */
function BlockView({ block, editor, defaultBlockType, slash, canvas = false, selected, select, selectBlock }: {
  block: Block;
  editor: EditorRuntime;
  defaultBlockType: string;
  slash: SlashMenuState | null;
  canvas?: boolean;
  selected?: boolean;
  select?: () => void;
  selectBlock?: (blockId: string, extend: boolean, toggle: boolean) => void;
}) {
  const layout = block.layout ?? { x: 40, y: 40, width: 320, height: 120, zIndex: 0 };
  const style: CSSProperties | undefined = canvas ? { left: layout.x, top: layout.y, width: layout.width, minHeight: layout.height, zIndex: layout.zIndex } : undefined;
  const slashPlugin = getSlashMenuPlugin(editor);
  const items = useMemo(() => {
    return slashPlugin?.getItems(editor, slash?.query) ?? [];
  }, [editor, editor.revision, slash?.query, slashPlugin]);
  const drag = (event: ReactPointerEvent): void => {
    if (!canvas) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: layout.x, top: layout.y };
    const move = (next: PointerEvent): void => editor.commands.execute("block.layout.set", { id: block.id, layout: { x: start.left + next.clientX - start.x, y: start.top + next.clientY - start.y } });
    const stop = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const resize = (event: ReactPointerEvent): void => {
    event.preventDefault(); event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, width: layout.width, height: layout.height };
    const move = (next: PointerEvent): void => editor.commands.execute("block.layout.set", { id: block.id, layout: { width: Math.max(180, start.width + next.clientX - start.x), height: Math.max(70, start.height + next.clientY - start.y) } });
    const stop = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const currentSelection = editor.selection.get();
  const blockSelected = canvas ? selected : currentSelection?.type === "block" && currentSelection.blockIds.includes(block.id);
  return <div className={canvas ? "rv-block rv-canvas-block" : "rv-block"} data-rivto-block={block.id}
    data-type={markdownType(block)} data-selected={blockSelected} style={style} onClick={(event) => {
      if (!select) return;
      const target = event.target instanceof Element ? event.target : null;
      // Canvas cards have two interaction layers. Text and form controls keep
      // their native caret/focus; clicking the card chrome selects the object.
      // Letting an editable click bubble into `select` replaces TextSelection
      // with EdgelessSelection and the reconciler then correctly clears it.
      if (target?.closest('[contenteditable="true"],input,textarea,select,a,button')) return;
      select();
    }}
    onPointerDown={(event) => editor.events.dispatch({ type: "pointerdown", blockId: block.id, payload: { button: event.button } })}
    onDragOver={(event) => { if (!canvas) event.preventDefault(); }}
    onDrop={(event) => { if (!canvas) { event.preventDefault(); editor.events.dispatch({ type: "drop", blockId: block.id, payload: { sourceId: event.dataTransfer.getData("application/x-rivto-block") } }); } }}
    tabIndex={canvas ? 0 : undefined}
    onKeyDown={(event) => {
      if (!canvas || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || (event.target as HTMLElement).isContentEditable) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      editor.commands.execute("block.layout.set", { id: block.id, layout: { x: layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y: layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) } });
    }}>
    {!canvas && <div className="rv-side" aria-label="Block controls" contentEditable={false}>
      <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-rivto-block", block.id)}
        onClick={(event) => selectBlock?.(block.id, event.shiftKey, event.metaKey || event.ctrlKey)} aria-label="Drag block">⋮</button>
      <button onClick={() => {
        const id = editor.commands.execute("block.insert", { block: { type: defaultBlockType }, afterId: block.id });
        editor.focus(id);
      }} aria-label="Add block below">＋</button>
      <button onClick={() => editor.commands.execute("block.indent", { id: block.id })} aria-label="Indent block">→</button>
      <button onClick={() => editor.commands.execute("block.outdent", { id: block.id })} aria-label="Outdent block">←</button>
      <button onClick={() => editor.commands.execute("block.remove", { id: block.id })} aria-label="Delete block">×</button>
      {editor.ui.get("sideMenu", editor.mode.get(), block.type).map((item) =>
        <button key={item.id} onClick={() => editor.commands.execute<Record<string, (payload: unknown) => unknown>>(item.command, { blockId: block.id })}>{item.title}</button>)}
    </div>}
    {canvas && <div className="rv-drag" onPointerDown={drag}>Drag block</div>}
    <BlockContent block={block} editor={editor} defaultBlockType={defaultBlockType} />
    {slash?.blockId === block.id && <SlashMenu editor={editor} blockId={block.id} items={items} />}
    {!canvas && block.children.length > 0 && <div className="rv-children">{block.children.map((child) =>
      <BlockView key={child.id} block={child} editor={editor} defaultBlockType={defaultBlockType} slash={slash} selectBlock={selectBlock} />)}</div>}
    {canvas && <button className="rv-resize" onPointerDown={resize} aria-label="Resize block" />}
  </div>;
}

/** Renders ordered block trees in document flow. */
export function BlockDOMRenderer({ editor, blocks, defaultBlockType, slash }: EditorRendererProps) {
  const page = useRef<HTMLDivElement>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const pointerSelection = useRef<({
    type: "text";
    anchorPosition?: EditorPosition;
    anchor?: DOMSelectionPoint;
    selection?: EditorSelection;
    x: number;
    y: number;
  } | {
    type: "block";
    x: number;
    y: number;
    moved: boolean;
  }) | null>(null);
  const visibleBlockIds = useMemo(() => {
    const flatten = (items: Block[]): string[] => items.flatMap((block) => [block.id, ...flatten(block.children)]);
    return flatten(blocks);
  }, [blocks]);
  /** Selects one block or a document-ordered range anchored by the prior selection. */
  const selectBlock = (blockId: string, extend: boolean, toggle: boolean): void => {
    const current = editor.selection.get();
    if (toggle && current?.type === "block") {
      const selected = new Set(current.blockIds);
      if (selected.has(blockId)) selected.delete(blockId); else selected.add(blockId);
      const blockIds = visibleBlockIds.filter((id) => selected.has(id));
      if (!blockIds.length) return editor.commands.execute("selection.clear");
      editor.commands.execute("selection.set", { selection: {
        type: "block", blockIds,
        anchorBlockId: blockIds.includes(current.anchorBlockId) ? current.anchorBlockId : blockId,
        focusBlockId: blockId,
      } });
      return;
    }
    const anchor = extend && current?.type === "block" ? current.anchorBlockId : blockId;
    const anchorIndex = visibleBlockIds.indexOf(anchor);
    const focusIndex = visibleBlockIds.indexOf(blockId);
    const blockIds = anchorIndex < 0 || focusIndex < 0
      ? [blockId]
      : visibleBlockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1);
    editor.commands.execute("selection.set", { selection: {
      type: "block", blockIds, anchorBlockId: anchor, focusBlockId: blockId,
    } });
  };
  useEffect(() => {
    /** Extends an active gesture when the pointer enters another block editing host. */
    const move = (event: PointerEvent): void => {
      const root = page.current;
      const start = pointerSelection.current;
      if (!root || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
      if (start.type === "block") {
        event.preventDefault();
        start.moved = true;
        root.dataset.rivtoPointerSelecting = "true";
        clearNativeSelection(root);
        const rect = {
          left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY),
          width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y),
        };
        setSelectionRect(rect);
        const blockIds = blockIdsInRect(root, rect);
        if (!blockIds.length) editor.commands.execute("selection.clear");
        else {
          const reverse = event.clientY < start.y;
          editor.commands.execute("selection.set", { selection: {
            type: "block", blockIds,
            anchorBlockId: reverse ? blockIds.at(-1)! : blockIds[0]!,
            focusBlockId: reverse ? blockIds[0]! : blockIds.at(-1)!,
          } });
        }
        return;
      }
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
      const directedSelection: EditorSelection = { type: "text", anchor: anchorPosition, head: headPosition };
      start.selection = directedSelection;
      editor.commands.execute("selection.set", { selection: directedSelection });
      setNativeSelection(anchor, head);
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
      setSelectionRect(null);
      // During the drag, CSS Highlight is authoritative because Chromium's
      // native range can collapse to the active host. Once pointer ownership is
      // released, restore the browser range from stable editor coordinates so
      // copy/cut and keyboard extension continue from the visible selection.
      if (root && completed?.type === "text" && completed.selection) {
        restoreEditorSelection(root, completed.selection ?? null);
        // Firefox may emit selectionchange after pointerup. Keep ownership
        // through that task, then restore once more before releasing the guard.
        setTimeout(() => {
          restoreEditorSelection(root, completed.selection ?? null);
          delete root.dataset.rivtoPointerSelecting;
        });
      }
      else if (root && completed?.type === "block" && completed.moved) {
        clearNativeSelection(root);
        setTimeout(() => {
          clearNativeSelection(root);
          delete root.dataset.rivtoPointerSelecting;
        });
      }
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
    onKeyDown={(event) => {
      const selection = editor.selection.get();
      if (selection?.type !== "block") return;
      if (event.key === "Escape") {
        event.preventDefault();
        editor.commands.execute("selection.clear");
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        selection.blockIds.forEach((id) => editor.commands.execute("block.remove", { id }));
        editor.commands.execute("selection.clear");
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const focusIndex = visibleBlockIds.indexOf(selection.focusBlockId);
      const next = visibleBlockIds[focusIndex + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) selectBlock(next, event.shiftKey, false);
    }}
    onPointerDownCapture={(event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(".rv-block-content") : null;
      const root = page.current;
      const anchor = target && root ? readDOMSelectionPoint(root, event.clientX, event.clientY) : undefined;
      // Store the portable anchor before native contenteditable handling runs.
      // Chromium may later report the current head for a hit-test at the old
      // coordinates; the stable block/offset remains valid across DOM rewrites.
      const anchorPosition = root && anchor ? readDOMPointPosition(root, anchor) : undefined;
      if (target) pointerSelection.current = { type: "text", anchorPosition, x: event.clientX, y: event.clientY };
      else if (event.target === root) {
        pointerSelection.current = { type: "block", x: event.clientX, y: event.clientY, moved: false };
        editor.commands.execute("selection.clear");
      } else pointerSelection.current = null;
    }}>
    {selectionRect && <div className="rv-selection-rect" style={{
      left: selectionRect.left - (page.current?.getBoundingClientRect().left ?? 0),
      top: selectionRect.top - (page.current?.getBoundingClientRect().top ?? 0),
      width: selectionRect.width, height: selectionRect.height,
    }} />}
    {blocks.map((block) => <BlockView key={block.id} block={block} editor={editor} defaultBlockType={defaultBlockType} slash={slash} selectBlock={selectBlock} />)}
  </div>;
}

/** Renders the same blocks on a scalable absolute-positioned DOM plane. */
export function EdgelessCanvasRenderer({ editor, blocks, defaultBlockType, slash, selected, setSelected, zoom }: EditorRendererProps) {
  return <div className="rv-canvas"><div className="rv-plane" style={{ transform: `scale(${zoom})` }}>
    <svg className="rv-links" width="2400" height="1600" aria-hidden="true">{editor.document.links.map((link) => {
      const from = blocks.find((block) => block.id === link.from.blockId)?.layout;
      const to = blocks.find((block) => block.id === link.to.blockId)?.layout;
      return from && to ? <line key={link.id} x1={from.x + from.width / 2} y1={from.y + from.height / 2}
        x2={to.x + to.width / 2} y2={to.y + to.height / 2} stroke="currentColor" strokeWidth="2" /> : null;
    })}</svg>
    {blocks.map((block) => <BlockView key={block.id} block={block} editor={editor} defaultBlockType={defaultBlockType}
      slash={slash} canvas selected={selected === block.id} select={() => setSelected(block.id)} />)}
  </div></div>;
}
