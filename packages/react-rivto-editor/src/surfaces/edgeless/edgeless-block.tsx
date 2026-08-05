import { useEdgelessSelection } from "../../extensions/edgeless/edgeless-runtime";
import type { EditorElement } from "@chulane/rivto";
import type { CSSProperties } from "react";
import { BlockTree } from "../../blocks";

/**
 * Renders one block element as a positioned canvas card.
 *
 * The shell owns only canvas geometry and object controls. BlockTree supplies
 * the existing recursive BlockView/content/dnd tree inside it, so both surfaces
 * share the complete block rendering and interaction policy.
 */
export function EdgelessBlockElement({
  element,
  blockIds,
}: {
  readonly element: EditorElement;
  readonly blockIds: readonly string[];
}) {
  const selection = useEdgelessSelection();
  if (!blockIds.length) return null;
  const style: CSSProperties = {
    left: element.frame.x,
    top: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
    zIndex: element.zIndex,
  };

  return (
    <section
      className="edgeless-card"
      data-edgeless-root={element.id}
      data-edgeless-object-kind="block"
      data-edgeless-object-id={element.id}
      data-block-selected={selection.active && selection.items.includes(element.id) || undefined}
      style={style}
      tabIndex={0}
    >
      <div className="edgeless-card-content" data-edgeless-card-content="true">
        <BlockTree blockIds={blockIds} />
      </div>
      <button
        type="button"
        className="edgeless-resize-handle"
        data-edgeless-resize-handle="true"
        aria-label="Resize canvas block element"
      />
    </section>
  );
}
