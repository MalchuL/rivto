import {
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RivtoEditorCore } from "./editor";
import type { EditorBlock, MarkdownFormat, SlashItem } from "./types";

export interface RivtoEditorProps {
  editor: RivtoEditorCore;
  className?: string;
  renderers?: {
    page?: ComponentType<EditorRendererProps>;
    edgeless?: ComponentType<EditorRendererProps>;
  };
}

export interface EditorRendererProps {
  editor: RivtoEditorCore;
  blocks: EditorBlock[];
  slash: { blockId: string; query: string } | null;
  setSlash: (value: { blockId: string; query: string } | null) => void;
  selected: string | null;
  setSelected: (value: string | null) => void;
  zoom: number;
}

const styles = `
.rivto{--rv-border:#ddd9cf;--rv-ink:#26241f;--rv-muted:#746f65;--rv-accent:#6e56cf;color:var(--rv-ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif;border:1px solid var(--rv-border);border-radius:14px;background:white;overflow:hidden}.rivto *{box-sizing:border-box}.rivto button,.rivto input{font:inherit}.rv-toolbar{display:flex;gap:6px;align-items:center;padding:9px;border-bottom:1px solid var(--rv-border);background:#faf9f6;position:relative;z-index:4}.rv-toolbar button,.rv-menu button{border:1px solid var(--rv-border);border-radius:7px;background:white;padding:5px 9px;cursor:pointer}.rv-toolbar button[aria-pressed=true]{color:white;background:var(--rv-ink)}.rv-spacer{flex:1}.rv-page{max-width:760px;min-height:420px;margin:auto;padding:48px 54px}.rv-block{position:relative;border-radius:7px;padding:3px 7px}.rv-block:hover{background:#faf9f6}.rv-side{display:none;position:absolute;right:100%;top:1px;gap:2px;padding-right:5px}.rv-block:hover>.rv-side,.rv-block:focus-within>.rv-side{display:flex}.rv-side button{border:0;background:transparent;color:var(--rv-muted);cursor:pointer;padding:3px}.rv-block-content{outline:0;min-height:1.5em;white-space:pre-wrap}.rv-block[data-type=heading] .rv-block-content{font-size:2em;font-weight:700}.rv-block[data-type=heading2] .rv-block-content{font-size:1.55em;font-weight:700}.rv-block[data-type=heading3] .rv-block-content{font-size:1.25em;font-weight:700}.rv-block[data-type=quote]{border-left:3px solid #b5afa2;padding-left:13px;color:#565149}.rv-block[data-type=code]{background:#f3f1ec;font-family:ui-monospace,monospace}.rv-prefix{display:inline-block;width:24px;color:var(--rv-muted);user-select:none}.rv-children{margin-left:28px}.rv-menu{position:absolute;top:100%;left:8px;width:260px;max-height:280px;overflow:auto;padding:6px;border:1px solid var(--rv-border);border-radius:10px;background:white;box-shadow:0 14px 40px #0002;z-index:10}.rv-menu button{display:block;width:100%;border:0;text-align:left}.rv-menu button:hover,.rv-menu button:focus{background:#f0edf9}.rv-canvas{height:600px;overflow:auto;background-color:#f8f7f3;background-image:radial-gradient(#c9c4b9 1px,transparent 1px);background-size:20px 20px}.rv-plane{position:relative;width:2400px;height:1600px;transform-origin:0 0}.rv-links{position:absolute;inset:0;pointer-events:none;color:#8b849d}.rv-canvas-block{position:absolute;border:1px solid var(--rv-border);border-radius:10px;background:white;box-shadow:0 5px 18px #0001;padding:10px;overflow:auto}.rv-canvas-block[data-selected=true]{outline:2px solid var(--rv-accent)}.rv-drag{cursor:grab;color:var(--rv-muted);font-size:12px;user-select:none}.rv-resize{position:absolute;right:2px;bottom:2px;width:14px;height:14px;border:0;background:linear-gradient(135deg,transparent 50%,var(--rv-muted) 50%);cursor:nwse-resize}.rv-media{display:grid;gap:7px;padding:10px;border:1px dashed var(--rv-border);border-radius:8px}.rv-media img{max-width:100%;max-height:280px}.rv-media input{width:100%;border:1px solid var(--rv-border);border-radius:6px;padding:6px}.rv-unknown{padding:10px;border:1px solid #e6a49b;background:#fff4f2;color:#7d2b22}.rv-divider{border:0;border-top:1px solid var(--rv-border);margin:12px 0}@media(max-width:650px){.rv-page{padding:28px 18px}.rv-toolbar{overflow:auto}}
`;

const textOf = (block: EditorBlock) => block.content;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character] ?? character);

const markdownType = (block: EditorBlock): string => {
  if (block.type !== "paragraph") return block.type;
  if (block.content.startsWith("### ")) return "heading3";
  if (block.content.startsWith("## ")) return "heading2";
  if (block.content.startsWith("# ")) return "heading";
  return block.type;
};

const htmlOf = (source: string): string => {
  const withoutHeading = source.replace(/^#{1,3} /, "");
  return escapeHtml(withoutHeading)
    .replace(/`([^\n`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\(((?:https?:\/\/|mailto:|\/|#)[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^\n*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^\n~]+)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^\n*]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
};

const selectionOffset = (element: HTMLElement): { from: number; length: number } | undefined => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  return { from: before.toString().length, length: range.toString().length };
};

function EditableText({ block, title, editor, onSlash }: {
  block: EditorBlock;
  title: string;
  editor: RivtoEditorCore;
  onSlash: (blockId: string, query: string | null) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const html = editing ? escapeHtml(block.content).replace(/\n/g, "<br>") : htmlOf(block.content);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element && element.innerHTML !== html) {
      element.innerHTML = html;
    }
  }, [html]);

  return <span
    ref={ref}
    className="rv-block-content"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label={title}
    onFocus={(event) => {
      if (!editing) event.currentTarget.textContent = block.content;
      setEditing(true);
    }}
    onBlur={() => setEditing(false)}
    onInput={(event) => {
      const text = event.currentTarget.innerText.replace(/\n$/, "");
      editor.setBlockText(block.id, text);
      onSlash(block.id, text.startsWith("/") ? text.slice(1) : null);
    }}
    onSelect={(event) => {
      const offset = selectionOffset(event.currentTarget);
      if (offset) editor.setSelection({
        anchor: { blockId: block.id, offset: offset.from },
        head: { blockId: block.id, offset: offset.from + offset.length },
      });
    }}
    onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const id = editor.insertBlock({ type: "paragraph" }, block.id);
        editor.focus(id);
      } else if (event.key === "Backspace" && textOf(block) === "") {
        event.preventDefault();
        editor.removeBlock(block.id);
      } else if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) editor.outdentBlock(block.id);
        else editor.indentBlock(block.id);
      }
    }}
  />;
}

function BlockContent({ block, editor, onSlash }: {
  block: EditorBlock;
  editor: RivtoEditorCore;
  onSlash: (blockId: string, query: string | null) => void;
}) {
  const spec = editor.getBlockSpec(block.type);
  if (!spec) return <div className="rv-unknown">Unknown block type: {block.type}</div>;
  if (block.type === "divider") return <hr className="rv-divider" />;
  if (block.type === "image" || block.type === "file") {
    const url = String(block.props.url ?? "");
    return <div className="rv-media">
      {block.type === "image" && url && <img src={url} alt={String(block.props.alt ?? "")} />}
      {block.type === "file" && url && <a href={url}>{String(block.props.name ?? url)}</a>}
      <input aria-label={`${block.type} URL`} placeholder={`${block.type} URL`} value={url}
        onChange={(event) => editor.setBlockProp(block.id, "url", event.target.value)} />
    </div>;
  }

  const prefix = block.type === "bulletListItem" ? "•" : block.type === "numberedListItem" ? "1." : block.type === "checkListItem" ? "☐" : "";
  const content = <>
    {prefix && <span className="rv-prefix" contentEditable={false}>{prefix}</span>}
    <EditableText block={block} title={spec.title ?? block.type} editor={editor} onSlash={onSlash} />
  </>;

  return spec.render ? <spec.render block={block} editor={editor} content={content} /> : content;
}

function BlockView({ block, editor, slash, setSlash, canvas = false, selected, select }: {
  block: EditorBlock;
  editor: RivtoEditorCore;
  slash: { blockId: string; query: string } | null;
  setSlash: (value: { blockId: string; query: string } | null) => void;
  canvas?: boolean;
  selected?: boolean;
  select?: () => void;
}) {
  const layout = block.layout ?? { x: 40, y: 40, width: 320, height: 120, zIndex: 0 };
  const style: CSSProperties | undefined = canvas ? {
    left: layout.x, top: layout.y, width: layout.width, minHeight: layout.height, zIndex: layout.zIndex,
  } : undefined;
  const items = useMemo(() => {
    const query = slash?.query.toLowerCase() ?? "";
    return editor.getSlashItems().filter((item) => [item.title, ...(item.aliases ?? [])].some((term) => term.toLowerCase().includes(query)));
  }, [editor, editor.revision, slash?.query]);

  const drag = (event: ReactPointerEvent) => {
    if (!canvas) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: layout.x, top: layout.y };
    const move = (next: PointerEvent) => editor.setBlockLayout(block.id, {
      x: start.left + next.clientX - start.x,
      y: start.top + next.clientY - start.y,
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const resize = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, width: layout.width, height: layout.height };
    const move = (next: PointerEvent) => editor.setBlockLayout(block.id, {
      width: Math.max(180, start.width + next.clientX - start.x),
      height: Math.max(70, start.height + next.clientY - start.y),
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return <div
    className={canvas ? "rv-block rv-canvas-block" : "rv-block"}
    data-rivto-block={block.id}
    data-type={markdownType(block)}
    data-selected={selected}
    style={style}
    onClick={select}
    draggable={!canvas}
    onDragStart={(event) => event.dataTransfer.setData("application/x-rivto-block", block.id)}
    onDragOver={(event) => { if (!canvas) event.preventDefault(); }}
    onDrop={(event) => {
      if (canvas) return;
      event.preventDefault();
      const source = event.dataTransfer.getData("application/x-rivto-block");
      if (source && source !== block.id) editor.moveBlock(source, block.id);
    }}
    tabIndex={canvas ? 0 : undefined}
    onKeyDown={(event) => {
      if (!canvas || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      if ((event.target as HTMLElement).isContentEditable) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      editor.setBlockLayout(block.id, {
        x: layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
        y: layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
      });
    }}
  >
    {!canvas && <div className="rv-side" aria-label="Block controls">
      <button onClick={() => editor.insertBlock({ type: "paragraph" }, block.id)} aria-label="Add block below">＋</button>
      <button onClick={() => editor.indentBlock(block.id)} aria-label="Indent block">→</button>
      <button onClick={() => editor.outdentBlock(block.id)} aria-label="Outdent block">←</button>
      <button onClick={() => editor.removeBlock(block.id)} aria-label="Delete block">×</button>
    </div>}
    {canvas && <div className="rv-drag" onPointerDown={drag}>Drag block</div>}
    <BlockContent block={block} editor={editor} onSlash={(blockId, query) => setSlash(query === null ? null : { blockId, query })} />
    {slash?.blockId === block.id && <SlashMenu editor={editor} blockId={block.id} items={items} close={() => setSlash(null)} />}
    {!canvas && block.children.length > 0 && <div className="rv-children">
      {block.children.map((child) => <BlockView key={child.id} block={child} editor={editor} slash={slash} setSlash={setSlash} />)}
    </div>}
    {canvas && <button className="rv-resize" onPointerDown={resize} aria-label="Resize block" />}
  </div>;
}

function SlashMenu({ editor, blockId, items, close }: { editor: RivtoEditorCore; blockId: string; items: SlashItem[]; close: () => void }) {
  return <div className="rv-menu" role="menu">
    {items.length === 0 ? <p>No matching blocks</p> : items.map((item) =>
      <button key={`${item.group}-${item.title}`} role="menuitem" onMouseDown={(event) => {
        event.preventDefault();
        if (item.run) item.run(editor, blockId);
        else if (item.block) editor.updateBlock(blockId, { ...item.block, content: "" });
        close();
        editor.focus(blockId);
      }}>{item.title}</button>)}
  </div>;
}

export function BlockDOMRenderer({ editor, blocks, slash, setSlash }: EditorRendererProps) {
  return <div className="rv-page">
    {blocks.map((block) => <BlockView key={block.id} block={block} editor={editor} slash={slash} setSlash={setSlash} />)}
  </div>;
}

export function EdgelessCanvasRenderer({ editor, blocks, slash, setSlash, selected, setSelected, zoom }: EditorRendererProps) {
  return <div className="rv-canvas">
    <div className="rv-plane" style={{ transform: `scale(${zoom})` }}>
      <svg className="rv-links" width="2400" height="1600" aria-hidden="true">
        {editor.links.map((link) => {
          const from = blocks.find((block) => block.id === link.from.blockId)?.layout;
          const to = blocks.find((block) => block.id === link.to.blockId)?.layout;
          if (!from || !to) return null;
          return <line key={link.id}
            x1={from.x + from.width / 2} y1={from.y + from.height / 2}
            x2={to.x + to.width / 2} y2={to.y + to.height / 2}
            stroke="currentColor" strokeWidth="2" />;
        })}
      </svg>
      {blocks.map((block) => {
        return <BlockView key={block.id} block={block} editor={editor} slash={slash} setSlash={setSlash}
          canvas selected={selected === block.id} select={() => setSelected(block.id)} />;
      })}
    </div>
  </div>;
}

export function RivtoEditor({ editor, className = "", renderers }: RivtoEditorProps) {
  useSyncExternalStore((listener) => editor.subscribe("document", listener), () => editor.revision, () => 0);
  const mode = useSyncExternalStore((listener) => editor.subscribe("mode", listener), () => editor.mode, () => "page");
  useSyncExternalStore((listener) => editor.subscribe("selection", listener), () => JSON.stringify(editor.selection), () => "null");
  const [slash, setSlash] = useState<{ blockId: string; query: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const blocks = editor.document;
  const PageRenderer = renderers?.page ?? BlockDOMRenderer;
  const CanvasRenderer = renderers?.edgeless ?? EdgelessCanvasRenderer;
  const rendererProps = { editor, blocks, slash, setSlash, selected, setSelected, zoom };

  const format = (format: MarkdownFormat, value?: string) => {
    const selection = editor.selection;
    if (!selection || selection.anchor.blockId !== selection.head.blockId) return;
    const from = Math.min(selection.anchor.offset, selection.head.offset);
    editor.formatText(selection.anchor.blockId, from, Math.abs(selection.head.offset - selection.anchor.offset), format, value);
  };

  return <div
    className={`rivto ${className}`}
    data-rivto-editor
    onCopy={(event) => editor.clipboardManager.handleCopyEvent(event.nativeEvent)}
    onPaste={(event) => editor.clipboardManager.handlePasteEvent(event.nativeEvent)}
  >
    <style>{styles}</style>
    <div className="rv-toolbar" role="toolbar" aria-label="Editor toolbar">
      <button onClick={() => editor.undo()} aria-label="Undo">↶</button>
      <button onClick={() => editor.redo()} aria-label="Redo">↷</button>
      <button onClick={() => format("bold")} aria-label="Bold"><strong>B</strong></button>
      <button onClick={() => format("italic")} aria-label="Italic"><em>I</em></button>
      <button onClick={() => format("strike")} aria-label="Strike"><s>S</s></button>
      <button onClick={() => format("code")} aria-label="Inline code">&lt;/&gt;</button>
      <button onClick={() => {
        const href = window.prompt("Link URL");
        if (href) format("link", href);
      }} aria-label="Link">Link</button>
      <span className="rv-spacer" />
      {mode === "edgeless" && <>
        <button onClick={() => setZoom(Math.max(.5, zoom - .1))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(2, zoom + .1))} aria-label="Zoom in">+</button>
      </>}
      <button onClick={() => editor.insertBlock({ type: "paragraph" }, blocks.at(-1)?.id)}>Add block</button>
      <button aria-pressed={mode === "page"} onClick={() => editor.setMode("page")}>Page</button>
      <button aria-pressed={mode === "edgeless"} onClick={() => editor.setMode("edgeless")}>Edgeless</button>
    </div>
    {mode === "page" ? <PageRenderer {...rendererProps} /> : <CanvasRenderer {...rendererProps} />}
  </div>;
}

export { RivtoEditor as RivtoEditorComponent };
