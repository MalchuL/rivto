import type { EditorElement } from "@chulane/rivto";
import { useRef, type CSSProperties } from "react";
import { EdgelessDragHandle } from "../../extensions/edgeless/edgeless-drag-handle";
import { useEdgelessSelection } from "../../extensions/edgeless/edgeless-runtime";
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
  const hostRef = useRef<HTMLElement | null>(null);
  if (!blockIds.length) return null;
  const selected = selection.active && selection.items.includes(element.id);
  /**
   * During resize, transform writes preview geometry as inline styles and sets
   * data-edgeless-geometry-lock. Re-renders must echo those inline values back
   * through the style prop — omitting them lets React clear left/top/width/height
   * and the card jumps.
   */
  const host = hostRef.current;
  const geometryLocked = host?.dataset.edgelessGeometryLock === "true";
  const style: CSSProperties = {
    left: geometryLocked && host.style.left ? host.style.left : element.frame.x,
    top: geometryLocked && host.style.top ? host.style.top : element.frame.y,
    width: geometryLocked && host.style.width ? host.style.width : element.frame.width,
    height: geometryLocked && host.style.height ? host.style.height : element.frame.height,
    zIndex: element.zIndex,
  };

  return (
    <section
      ref={hostRef}
      className="edgeless-card"
      data-edgeless-root={element.id}
      data-edgeless-object-kind="block"
      data-edgeless-object-id={element.id}
      data-block-selected={selected || undefined}
      style={style}
      tabIndex={0}
    >
      <div className="edgeless-card-content" data-edgeless-card-content="true">
        <BlockTree blockIds={blockIds} />
      </div>
      {selected && <EdgelessDragHandle label="Drag canvas block" />}
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <button
          key={corner}
          type="button"
          className="edgeless-resize-handle"
          data-edgeless-resize-handle={corner}
          aria-label={`Resize canvas block ${corner}`}
        />
      ))}
    </section>
  );
}
