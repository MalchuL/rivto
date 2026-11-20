import { useRef, useState } from "react";
import type { EditableLabelFocusPoint } from "../../components";
import type { VisualLabelEditing } from "./types";

/**
 * Retains one visual's editing state and requested initial caret position.
 *
 * @returns Local editing state and a point-based operation to start editing.
 */
export function useVisualLabelEditing(): VisualLabelEditing {
  const [editing, setEditing] = useState(false);
  const focusPointRef = useRef<EditableLabelFocusPoint | null>(null);
  return {
    editing,
    setEditing,
    focusPointRef,
    /**
     * Starts label editing at the supplied viewport position.
     *
     * @param point - Point used for the initial caret placement.
     * @returns The point is retained and editing is enabled.
     */
    startEditing(point) {
      focusPointRef.current = point;
      setEditing(true);
    },
  };
}
