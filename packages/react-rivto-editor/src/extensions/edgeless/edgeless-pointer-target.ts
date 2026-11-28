/** Inputs used to resolve a canvas click within a group. */
export interface EdgelessPointerTarget {
  /** Element directly under the pointer. */
  readonly elementId: string;
  /** Selectable direct group parent, when present. */
  readonly parentId?: string;
  /** Sole currently selected element, if there is exactly one. */
  readonly selectedId?: string;
  /** Selectable direct parent of the selected element, if any. */
  readonly selectedParentId?: string;
  /** Whether the toggle-selection modifier is held. */
  readonly primary: boolean;
}

/**
 * Resolves the group or child reached by a canvas pointer gesture.
 *
 * The first plain click enters the parent; a later click while that group or one
 * of its children is selected reaches the child. Modifier clicks target the child.
 *
 * @param target - Hit element, current selection, and its group relationships.
 * @returns The selectable element ID for the gesture.
 */
export function resolveEdgelessPointerTarget(target: EdgelessPointerTarget): string {
  const { elementId, parentId, selectedId, selectedParentId, primary } = target;
  if (!parentId || primary) {
    return elementId;
  }
  // Purpose: second click (or sibling click) enters/switches the child under the active group.
  if (selectedId === elementId || selectedId === parentId || selectedParentId === parentId) {
    return elementId;
  }
  // Purpose: first click on any grouped child selects the group shell first.
  return parentId;
}
