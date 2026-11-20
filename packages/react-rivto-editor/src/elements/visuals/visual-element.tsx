/**
 * One first-class edgeless visual (shape, text, sticker, drawing, connector).
 *
 * Selection handles subscribe per visual ID so marquee growth over a neighbor
 * does not re-render this node or recreate its label editor.
 */
import { memo } from "react";
import type { EditorElementNode } from "@chulane/rivto";
import { ElementSlots } from "../../blocks";
import { useEdgelessSelected } from "../../extensions/built-ins/selection/edgeless-runtime";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";
import { useEdgelessElementStyle } from "../../hooks/elements/use-edgeless-element-style";
import { createVisualLabelInput } from "./browser/visual-label-input";
import type { VisualElementContentProps } from "./types";
import { useVisualLabelEditing } from "./use-visual-label-editing";

/**
 * Renders one persisted visual without owning canvas movement.
 *
 * Selection chrome is subscribed per visual ID so a sibling entering the
 * marquee does not re-render this node.
 *
 * @param props - Visual snapshot, edgeless operations, and viewport scale.
 * @param props.element - Element with registered defaults and local previews.
 * @param props.edgelessOperation - Owning edgeless operations.
 * @param props.zoom - Current canvas zoom factor.
 * @returns Positioned visual host with optional resize/rotate chrome.
 */
export const VisualElement = memo(function VisualElement({
  element,
  edgelessOperation,
  zoom,
}: {
  readonly element: EditorElementNode;
  readonly edgelessOperation: EdgelessOperations;
  readonly zoom: number;
}) {
  const selected = useEdgelessSelected(element.id);
  const registration = edgelessOperation.runtime.elementTypes.get(element.type);
  const reactPanel = edgelessOperation.reactPanel;
  const { editing, setEditing, focusPointRef, startEditing } = useVisualLabelEditing();
  // Echo transform preview inline styles while locked so React does not clear them.
  const { ref, style } = useEdgelessElementStyle<HTMLDivElement>(
    element,
    registration?.behavior?.absoluteGeometry,
  );
  return (
    <div
      ref={ref}
      className="edgeless-visual"
      data-edgeless-object-kind="visual"
      data-edgeless-object-id={element.id}
      data-canvas-element={element.id}
      data-edgeless-visual-kind={element.type}
      data-selected={selected || undefined}
      data-editing={editing || undefined}
      style={style}
      onDoubleClick={createVisualLabelInput(
        reactPanel,
        Boolean(registration?.behavior?.editableLabel),
        startEditing,
      )}
    >
      <VisualElementContent
        Renderer={registration?.render}
        element={element}
        reactPanel={reactPanel}
        operations={edgelessOperation}
        selected={selected}
        zoom={zoom}
        editing={editing}
        setEditing={setEditing}
        focusPointRef={focusPointRef}
      />
      <ElementSlots element={element} selected={selected} />
    </div>
  );
});

/**
 * Renders registered visual content or its unknown-type fallback.
 *
 * @param props - Renderer, panel, and the current visual editing state.
 * @returns Registered content when its panel is available, otherwise a status message.
 */
function VisualElementContent({ Renderer, reactPanel, ...props }: VisualElementContentProps) {
  if (!Renderer || !reactPanel) {
    return <div role="status">Unknown element: {props.element.type}</div>;
  }
  return <Renderer {...props} reactPanel={reactPanel} preview={false} />;
}
