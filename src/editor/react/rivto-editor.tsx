import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { EditorMode, MarkdownFormat } from "../editor";
import { getSlashMenuPlugin } from "../plugins";
import { BlockDOMRenderer, EdgelessCanvasRenderer } from "./renderers";
import { clearCrossBlockHighlight, clearNativeSelection, readEditorSelection, restoreEditorSelection, updateCrossBlockHighlight } from "./selection";
import { editorStyles } from "./styles";
import type { RivtoEditorProps } from "./types";

/**
 * React binding that projects EditorRuntime state into browser interaction.
 *
 * The component owns only presentation state such as slash query and zoom.
 * Document mutations, selection, mode, event routing, and contributed actions
 * remain in the runtime so alternate renderers observe the same behavior.
 */
export function RivtoEditor({ editor, defaultBlockType, className = "", renderers }: RivtoEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  useSyncExternalStore((listener) => editor.subscribe(listener), () => editor.revision, () => 0);
  const mode: EditorMode = useSyncExternalStore((listener) => editor.mode.subscribe(listener), () => editor.mode.get(), () => "block" as EditorMode);
  const selectionRevision = useSyncExternalStore(
    (listener) => editor.selection.subscribe(listener),
    () => JSON.stringify(editor.selection.get()),
    () => "null",
  );
  const slashPlugin = getSlashMenuPlugin(editor);
  const slash = useSyncExternalStore(
    (listener) => slashPlugin?.subscribe(listener) ?? (() => undefined),
    () => slashPlugin?.getState() ?? null,
    () => null,
  );
  const [zoom, setZoom] = useState(1);
  const blocks = editor.document.document;
  const selection = editor.selection.get();
  const selected = selection?.type === "edgeless" ? selection.blockIds[0] ?? null : null;
  // Every selection variant identifies its active block differently. Reducing
  // them here gives toolbar contributions one consistent block context without
  // leaking selection-shape branching into each action renderer.
  const activeBlockId = selection?.type === "text" ? selection.anchor.blockId
    : selection?.type === "block" ? selection.focusBlockId
      : selection?.blockIds[0];
  // The toolbar can target nested blocks, while DocumentModel exposes a tree.
  // Work only with detached block values; React never traverses CRDT containers.
  const flatten = (items: typeof blocks): typeof blocks => items.flatMap((block) => [block, ...flatten(block.children)]);
  const activeBlock = flatten(blocks).find((block) => block.id === activeBlockId);
  const toolbarItems = editor.ui.get("toolbar", mode, activeBlock?.type);
  const setSelected = (blockId: string | null): void => {
    if (blockId) editor.commands.execute("selection.set", { selection: { type: "edgeless", blockIds: [blockId] } });
    else editor.commands.execute("selection.clear");
  };
  const PageRenderer = renderers?.page ?? BlockDOMRenderer;
  const CanvasRenderer = renderers?.edgeless ?? EdgelessCanvasRenderer;
  const rendererProps = { editor, blocks, defaultBlockType, slash, selected, setSelected, zoom };
  useEffect(() => {
    /** Synchronizes the browser's possibly cross-block range into local editor state. */
    const synchronizeSelection = (): void => {
      if (!root.current) return;
      // BlockDOMRenderer owns selection while bridging separate editing hosts.
      // Chromium emits intermediate same-host selectionchange events during an
      // upward drag; accepting them would erase the renderer's live cross-block
      // anchor/head and make highlighting disappear until pointer-up.
      if (root.current.querySelector('[data-rivto-pointer-selecting="true"]')) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.commands.execute("selection.set", { selection });
    };
    document.addEventListener("selectionchange", synchronizeSelection);
    return () => document.removeEventListener("selectionchange", synchronizeSelection);
  }, [editor]);
  useLayoutEffect(() => {
    if (root.current) {
      const selection = editor.selection.get();
      if (selection?.type === "text") restoreEditorSelection(root.current, selection);
      else clearNativeSelection(root.current);
      updateCrossBlockHighlight(root.current, selection);
    }
    return () => { if (root.current) clearCrossBlockHighlight(root.current); };
  }, [editor, mode, selectionRevision]);
  /** Applies Markdown formatting to the current single-block selection. */
  const format = (format: MarkdownFormat, value?: string): void => {
    const selection = editor.selection.get();
    if (!selection || selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) return;
    const from = Math.min(selection.anchor.offset, selection.head.offset);
    editor.commands.execute("text.format", { id: selection.anchor.blockId, from, length: Math.abs(selection.head.offset - selection.anchor.offset), format, value });
  };
  return <div ref={root} className={`rivto ${className}`} data-rivto-editor
    onCopy={(event) => {
      const selection = editor.selection.get();
      const blockId = selection?.type === "text" ? selection.anchor.blockId : selection?.blockIds[0];
      // Extensions get the first chance to claim clipboard events. The built-in
      // command runs only when global and block-scoped plugins decline the event.
      if (!editor.events.dispatch({ type: "copy", blockId, payload: { event: event.nativeEvent } })) {
        editor.commands.execute("clipboard.copyEvent", { event: event.nativeEvent });
      }
    }}
    onPaste={(event) => {
      // `selectionchange` is asynchronous in browsers. Ctrl+V can arrive before
      // SelectionManager receives the newest caret, so read the native range at
      // paste time. ClipboardManager remains DOM-agnostic while still receiving
      // the exact insertion point the user sees.
      const nativeSelection = root.current ? readEditorSelection(root.current) : undefined;
      if (nativeSelection) editor.commands.execute("selection.set", { selection: nativeSelection });
      if (!editor.events.dispatch({ type: "paste", blockId: nativeSelection?.anchor.blockId, payload: { event: event.nativeEvent, defaultBlockType } })) {
        editor.commands.execute("clipboard.pasteEvent", { event: event.nativeEvent, defaultBlockType });
      }
    }}>
    <style>{editorStyles}</style>
    <div className="rv-toolbar" role="toolbar" aria-label="Editor toolbar">
      <button onClick={() => editor.commands.execute("history.undo")} aria-label="Undo">↶</button><button onClick={() => editor.commands.execute("history.redo")} aria-label="Redo">↷</button>
      <button onClick={() => format("bold")} aria-label="Bold"><strong>B</strong></button>
      <button onClick={() => format("italic")} aria-label="Italic"><em>I</em></button>
      <button onClick={() => format("strike")} aria-label="Strike"><s>S</s></button>
      <button onClick={() => format("code")} aria-label="Inline code">&lt;/&gt;</button>
      <button onClick={() => { const href = window.prompt("Link URL"); if (href) format("link", href); }} aria-label="Link">Link</button>
      <span className="rv-spacer" />
      {mode === "edgeless" && <><button onClick={() => setZoom(Math.max(.5, zoom - .1))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(2, zoom + .1))} aria-label="Zoom in">+</button></>}
      {toolbarItems.map((item) => <button key={item.id} onClick={() => editor.commands.execute<Record<string, (payload: unknown) => unknown>>(item.command, { blockId: activeBlockId })}>{item.title}</button>)}
      <button onClick={() => {
        const id = editor.commands.execute("block.insert", { block: { type: defaultBlockType }, afterId: blocks.at(-1)?.id });
        editor.focus(id);
      }}>Add block</button>
      <button aria-pressed={mode === "block"} onClick={() => editor.commands.execute("mode.set", { mode: "block" })}>Block</button>
      <button aria-pressed={mode === "edgeless"} onClick={() => editor.commands.execute("mode.set", { mode: "edgeless" })}>Edgeless</button>
    </div>
    {mode === "block" ? <PageRenderer {...rendererProps} /> : <CanvasRenderer {...rendererProps} />}
  </div>;
}
