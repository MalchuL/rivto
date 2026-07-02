import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MarkdownFormat } from "../editor";
import { BlockDOMRenderer, EdgelessCanvasRenderer } from "./renderers";
import { clearCrossBlockHighlight, readEditorSelection, updateCrossBlockHighlight } from "./selection";
import { editorStyles } from "./styles";
import type { RivtoEditorProps, SlashState } from "./types";

/** React binding that subscribes to an editor and selects a renderer strategy. */
export function RivtoEditor({ editor, defaultBlockType, className = "", renderers }: RivtoEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  useSyncExternalStore((listener) => editor.subscribe("document", listener), () => editor.revision, () => 0);
  const mode = useSyncExternalStore((listener) => editor.subscribe("mode", listener), () => editor.mode, () => "page");
  const selectionRevision = useSyncExternalStore(
    (listener) => editor.subscribe("selection", listener),
    () => JSON.stringify(editor.selection),
    () => "null",
  );
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const blocks = editor.document;
  const PageRenderer = renderers?.page ?? BlockDOMRenderer;
  const CanvasRenderer = renderers?.edgeless ?? EdgelessCanvasRenderer;
  const rendererProps = { editor, blocks, defaultBlockType, slash, setSlash, selected, setSelected, zoom };
  useEffect(() => {
    /** Synchronizes the browser's possibly cross-block range into local editor state. */
    const synchronizeSelection = (): void => {
      if (!root.current) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.setSelection(selection);
    };
    document.addEventListener("selectionchange", synchronizeSelection);
    return () => document.removeEventListener("selectionchange", synchronizeSelection);
  }, [editor]);
  useLayoutEffect(() => {
    if (root.current) updateCrossBlockHighlight(root.current, editor.selection);
    return () => { if (root.current) clearCrossBlockHighlight(root.current); };
  }, [editor, mode, selectionRevision]);
  /** Applies Markdown formatting to the current single-block selection. */
  const format = (format: MarkdownFormat, value?: string): void => {
    const selection = editor.selection;
    if (!selection || selection.anchor.blockId !== selection.head.blockId) return;
    const from = Math.min(selection.anchor.offset, selection.head.offset);
    editor.formatText(selection.anchor.blockId, from, Math.abs(selection.head.offset - selection.anchor.offset), format, value);
  };
  return <div ref={root} className={`rivto ${className}`} data-rivto-editor
    onCopy={(event) => editor.clipboardManager.handleCopyEvent(event.nativeEvent)}
    onPaste={(event) => editor.clipboardManager.handlePasteEvent(event.nativeEvent, defaultBlockType)}>
    <style>{editorStyles}</style>
    <div className="rv-toolbar" role="toolbar" aria-label="Editor toolbar">
      <button onClick={() => editor.undo()} aria-label="Undo">↶</button><button onClick={() => editor.redo()} aria-label="Redo">↷</button>
      <button onClick={() => format("bold")} aria-label="Bold"><strong>B</strong></button>
      <button onClick={() => format("italic")} aria-label="Italic"><em>I</em></button>
      <button onClick={() => format("strike")} aria-label="Strike"><s>S</s></button>
      <button onClick={() => format("code")} aria-label="Inline code">&lt;/&gt;</button>
      <button onClick={() => { const href = window.prompt("Link URL"); if (href) format("link", href); }} aria-label="Link">Link</button>
      <span className="rv-spacer" />
      {mode === "edgeless" && <><button onClick={() => setZoom(Math.max(.5, zoom - .1))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(2, zoom + .1))} aria-label="Zoom in">+</button></>}
      <button onClick={() => editor.insertBlock({ type: defaultBlockType }, blocks.at(-1)?.id)}>Add block</button>
      <button aria-pressed={mode === "page"} onClick={() => editor.setMode("page")}>Page</button>
      <button aria-pressed={mode === "edgeless"} onClick={() => editor.setMode("edgeless")}>Edgeless</button>
    </div>
    {mode === "page" ? <PageRenderer {...rendererProps} /> : <CanvasRenderer {...rendererProps} />}
  </div>;
}
