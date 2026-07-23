import {
  useBlock,
  useBlockSelection,
  type EditorBlockLayout,
} from "../../internal";
import type { CSSProperties } from "react";
import { PageBlock } from "../page/PageBlock";

const FALLBACK_LAYOUT: EditorBlockLayout = {
  x: 60,
  y: 60,
  width: 320,
  height: 120,
  zIndex: 0,
};

/**
 * Renders one document root as a positioned canvas object.
 *
 * The shell owns only canvas geometry and object controls. PageBlock supplies
 * the existing recursive BlockView/content/dnd tree inside it, so both surfaces
 * share block behavior while collapse remains a page-only presentation state.
 */
export function EdgelessRootBlock({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  const selection = useBlockSelection(blockId);
  if (!block) return null;
  const layout = block.layout ?? FALLBACK_LAYOUT;
  const style: CSSProperties = {
    left: layout.x,
    top: layout.y,
    width: layout.width,
    height: layout.height,
    zIndex: layout.zIndex,
  };

  return (
    <section
      className="edgeless-card"
      data-edgeless-root={block.id}
      data-block-type={block.type}
      data-selected={selection?.type === "edgeless" || undefined}
      style={style}
      tabIndex={0}
    >
      <header className="edgeless-card-header">
        <button
          type="button"
          className="edgeless-drag-handle"
          data-edgeless-drag-handle="true"
          aria-label={`Move canvas block: ${block.content || block.type}`}
        >
          Move
        </button>
      </header>
      <div className="edgeless-card-body">
        <PageBlock blockId={block.id} ignoreCollapse />
      </div>
      <button
        type="button"
        className="edgeless-resize-handle"
        data-edgeless-resize-handle="true"
        aria-label={`Resize canvas block: ${block.content || block.type}`}
      />
    </section>
  );
}
