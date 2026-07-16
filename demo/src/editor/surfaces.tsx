import { BlockView, useEditor, useEditorRevision, type EditorBlock } from "@chulane/rivto";
import { BlockContent } from "./block-content";

function selected(editor: ReturnType<typeof useEditor>, id: string): boolean {
  const value = editor.selection.get();
  return Boolean(value && value.type !== "text" && value.blockIds.includes(id));
}

function PageBlock({ block }: { block: EditorBlock }) {
  const editor = useEditor();
  return (
    <BlockView block={block} selected={selected(editor, block.id)}>
      <BlockContent block={block} />
      {block.children.length > 0 && <div className="rv-block-children">{block.children.map((child) => <PageBlock key={child.id} block={child} />)}</div>}
    </BlockView>
  );
}

export function PageSurface() {
  const editor = useEditor();
  useEditorRevision();
  return <div className="rv-page" data-rivto-surface-content="block">{editor.getBlocks().map((block) => <PageBlock key={block.id} block={block} />)}</div>;
}

function CanvasBlock({ block }: { block: EditorBlock }) {
  const editor = useEditor();
  return <BlockView block={block} selected={selected(editor, block.id)}><BlockContent block={block} /></BlockView>;
}

export function EdgelessSurface() {
  const editor = useEditor();
  useEditorRevision();
  return <div className="rv-canvas" data-rivto-surface-content="edgeless">{editor.getBlocks().map((block) => <CanvasBlock key={block.id} block={block} />)}</div>;
}
