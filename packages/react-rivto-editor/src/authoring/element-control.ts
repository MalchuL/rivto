import type { MouseEventHandler, PointerEventHandler } from "react";

/** Native event attributes for a control inside a canvas element. */
export interface ElementControlProps<T extends Element> {
  /** Keeps surface-level canvas gestures away from the control. */
  readonly "data-edgeless-ui": "true";
  /** Stops canvas pointer handling before invoking the optional control handler. */
  readonly onPointerDown: PointerEventHandler<T>;
  /** Prevents element label editing from starting on the control. */
  readonly onDoubleClick: MouseEventHandler<T>;
}

/**
 * Preserves a canvas element's internal control gestures and optional pointer action.
 *
 * This does not prevent native input or click behavior. Forward all returned props
 * to the actual interactive element; use the callback for control-specific pointer
 * work such as selecting the owning element or starting pointer capture.
 *
 * @param onPointerDown - Optional action invoked after pointer propagation is stopped.
 * @returns Attributes and handlers to spread onto one canvas element control.
 */
export function elementControlProps<T extends Element>(
  onPointerDown?: PointerEventHandler<T>,
): ElementControlProps<T> {
  return {
    "data-edgeless-ui": "true",
    onPointerDown: (event) => {
      event.stopPropagation();
      onPointerDown?.(event);
    },
    onDoubleClick: (event) => {
      event.stopPropagation();
    },
  };
}
