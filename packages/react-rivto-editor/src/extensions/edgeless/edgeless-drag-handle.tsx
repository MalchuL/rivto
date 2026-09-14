/**
 * Shared left-edge grab chrome for selected edgeless frames.
 *
 * Pure visual control — no object id. Mount it inside the moved frame
 * (block card, visual, or group bound) so transform preview moves it with
 * the parent and nothing else has to reconcile its position.
 */
import type { ElementSlotProps } from "../../managers";

const EDGELESS_DRAG_HANDLE_CLASS = "edgeless-drag-handle";

/**
 * Renders one canvas drag handle with an explicit accessible label.
 *
 * @param props - Accessible label describing the moved object.
 * @returns Drag button consumed by delegated edgeless gestures.
 */
export function EdgelessDragHandle({ label }: { readonly label: string }) {
  return (
    <button
      type="button"
      className={EDGELESS_DRAG_HANDLE_CLASS}
      data-edgeless-drag-handle="true"
      aria-label={label}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

/**
 * Adapts a first-class element slot context to the shared canvas drag control.
 *
 * @param props - Current canvas-element slot context.
 * @returns Drag handle labelled for a card, group, or visual element.
 */
export function EdgelessElementDragSlot({ element }: ElementSlotProps) {
  const groupTitle = typeof element.props.title === "string" ? element.props.title : "group";
  const label = element.type === "block"
    ? "Drag canvas block"
    : element.type === "group" ? `Move ${groupTitle}` : `Drag ${element.type}`;
  return <EdgelessDragHandle label={label} />;
}
