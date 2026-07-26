/** A DOM selection point saved inside the edited element or elsewhere. */
type SavedPoint =
  | { readonly textOffset: number }
  | { readonly node: Node; readonly offset: number };

/** Anchor and focus points preserve both collapsed and directional selections. */
export interface SavedDOMSelection {
  readonly anchor: SavedPoint;
  readonly focus: SavedPoint;
}

/** Converts a DOM point inside `root` into a plain-text character offset. */
function savePoint(root: HTMLElement, node: Node, offset: number): SavedPoint {
  if (!root.contains(node)) return { node, offset };

  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return { textOffset: range.toString().length };
}

/** Resolves a saved character offset against the element's current text nodes. */
function restorePoint(root: HTMLElement, point: SavedPoint): [Node, number] {
  if ("node" in point) return [point.node, point.offset];

  const walker = root.ownerDocument.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  let remaining = point.textOffset;
  let textNode = walker.nextNode();

  while (textNode) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) return [textNode, remaining];
    remaining -= length;
    textNode = walker.nextNode();
  }

  // Empty editable elements have no text node, but the element itself accepts
  // a child offset of zero as a valid caret position.
  return [root, 0];
}

/**
 * Saves the current DOM selection when at least one endpoint is inside `root`.
 *
 * Endpoints inside the editable element are stored as character offsets because
 * assigning `textContent` replaces their text nodes. Endpoints outside it keep
 * their DOM position, which also preserves cross-block selections.
 *
 * @param root - Editable element whose text nodes may be replaced.
 * @returns Saved selection, or null when the document selection is unrelated.
 */
export function saveDOMSelection(root: HTMLElement): SavedDOMSelection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) && !root.contains(selection.focusNode)) return null;

  return {
    anchor: savePoint(root, selection.anchorNode, selection.anchorOffset),
    focus: savePoint(root, selection.focusNode, selection.focusOffset),
  };
}

/**
 * Restores a selection after the editable element's text nodes were replaced.
 *
 * A disconnected external endpoint can occur if another React update removed a
 * selected block. In that case the browser selection is left unchanged instead
 * of turning document synchronization into a rendering error.
 *
 * @param root - Editable element containing the replacement text nodes.
 * @param saved - Selection previously returned by saveDOMSelection.
 */
export function restoreDOMSelection(root: HTMLElement, saved: SavedDOMSelection | null): void {
  if (!saved) return;

  const selection = root.ownerDocument.getSelection();
  if (!selection) return;

  const [anchorNode, anchorOffset] = restorePoint(root, saved.anchor);
  const [focusNode, focusOffset] = restorePoint(root, saved.focus);

  try {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  } catch {
    // A selection endpoint outside `root` may have been removed concurrently.
  }
}
