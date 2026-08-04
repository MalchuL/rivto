import type { EditorBlockLayout as BlockLayout } from "@chulane/rivto";
import { useBlock } from "../../hooks";
import { useEdgelessSelection } from "../../extensions/edgeless/edgeless-runtime";
import type { CSSProperties } from "react";
import { PageBlock } from "../page/page-block";

const FALLBACK_LAYOUT: BlockLayout = {
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
  const selection = useEdgelessSelection();
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
      data-edgeless-object-kind="block"
      data-edgeless-object-id={block.id}
      data-block-selected={selection.active && selection.items.some((item) => item.kind === "block" && item.id === block.id) || undefined}
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
        <PageBlock blockId={block.id} ignoreCollapse showListMarker={false} />
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
