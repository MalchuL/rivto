import { useState, type PropsWithChildren } from "react";
import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR, useEditor, useEditorEvent, useEditorRoot, type ViewPlugin } from "@chulane/rivto";

const items = [
  ["paragraph", "Paragraph"],
  ["heading", "Heading 1"],
  ["heading2", "Heading 2"],
  ["heading3", "Heading 3"],
  ["bulletListItem", "Bulleted list"],
  ["quote", "Quote"],
] as const;

function SlashView({ children }: PropsWithChildren) {
  const editor = useEditor();
  const root = useEditorRoot();
  const [blockId, setBlockId] = useState<string | null>(null);
  useEditorEvent("input", (event) => {
    const content = event.target instanceof Element ? event.target.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`) : null;
    const id = content?.closest<HTMLElement>(`[${RIVTO_BLOCK_ATTR}]`)?.getAttribute(RIVTO_BLOCK_ATTR) ?? null;
    setBlockId(content?.textContent === "/" ? id : null);
  });
  const choose = (type: string): void => {
    if (!blockId) return;
    editor.updateBlock(blockId, { content: "" });
    editor.setBlockType(blockId, type);
    setBlockId(null);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[${RIVTO_BLOCK_ATTR}="${CSS.escape(blockId)}"] [${RIVTO_BLOCK_CONTENT_ATTR}]`)?.focus());
  };
  return <>{children}{blockId && <div className="rv-slash-menu" role="menu" aria-label="Block types">{items.map(([type, label]) => <button key={type} type="button" role="menuitem" onClick={() => choose(type)}>{label}</button>)}</div>}</>;
}

export const slashPlugin: ViewPlugin = { id: "demo.slash", View: SlashView };
