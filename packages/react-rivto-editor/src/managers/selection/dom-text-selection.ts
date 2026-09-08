/**
 * Save / restore browser selection around an in-place text rewrite.
 *
 * Used when code assigns `element.textContent = …` (or similar) and would
 * otherwise destroy the live caret. Sibling file `editor-dom-selection.ts`
 * bridges browser ranges ↔ Rivto `{ blockId, offset }`; this file only keeps
 * the browser Selection alive across one element's text-node replacement.
 *
 * ## DOM vocabulary (Node vs Element vs Text)
 *
 * ```text
 * Node          — anything in the DOM tree
 *  └── Element      — a tag (`<div>`, `<span>`, …)
 *       └── HTMLElement — an HTML tag (`root` here: the editable host)
 * ```
 *
 * Character content is also a Node. `<div>hello</div>` builds:
 *
 * ```text
 * HTMLElement <div>     ← root (Element / HTMLElement)
 *   └── Text "hello"    ← Node, but NOT an Element
 * ```
 *
 * `Selection.anchorNode` is usually that Text node, with `anchorOffset` as a
 * character index inside it. Setting `root.textContent = "new"` **replaces**
 * those Text nodes with brand-new ones — old Node pointers become detached
 * and useless. That is why endpoints *inside* `root` are saved as a plain
 * character offset (`textOffset`), then remapped onto the new Text nodes.
 *
 * Endpoints *outside* `root` keep `{ node, offset }` because their Nodes were
 * not replaced by this rewrite (e.g. the other end of a cross-block selection).
 */

/**
 * One saved caret endpoint.
 *
 * - `{ textOffset }` — was inside `root`; character index into `root`'s plain
 *   text. Survives Text-node replacement.
 * - `{ node, offset }` — was outside `root`; live DOM Node + offset, same
 *   shape as `Selection` / `setBaseAndExtent` (Node is often Text).
 *
 * A single representation cannot safely cover both locations:
 *
 * - Always storing `{ node, offset }` would retain a pointer to an internal
 *   Text node that becomes detached when `root.textContent` is replaced.
 * - Always storing a text offset would lose which external block or DOM node
 *   owns the other endpoint of a cross-block selection.
 *
 * One object with optional `node` and `textOffset` fields would still contain
 * these same two states, but would also permit invalid combinations. The union
 * makes TypeScript require callers to handle exactly one valid case.
 */
type SavedPoint =
  | { readonly textOffset: number }
  | { readonly node: Node; readonly offset: number };

/**
 * Anchor and focus points for a directed browser selection.
 *
 * Both ends are saved independently so collapsed carets and bottom→top
 * selections keep their direction (unlike a normalized Range).
 */
export interface SavedDOMSelection {
  readonly anchor: SavedPoint;
  readonly focus: SavedPoint;
}

/**
 * Converts a live DOM caret `(node, offset)` into a durable saved point.
 *
 * Logic:
 * - If `node` is outside `root`, keep the live Node pointer — those Text /
 *   Element nodes are not about to be replaced by rewriting `root`.
 * - If `node` is inside `root`, measure a plain-text character offset from the
 *   start of `root` (Range from content start → `(node, offset)`). After
 *   `textContent` assignment the old Text node is gone; only the number lasts.
 *
 * @param root - Editable HTMLElement whose Text children may be replaced.
 * @param node - Live caret Node (`Selection.anchorNode` / `focusNode`), usually Text.
 * @param offset - Caret offset inside `node` (character index for Text).
 */
function savePoint(root: HTMLElement, node: Node, offset: number): SavedPoint {
  // Outside root → keep the Node (often a Text node in another block).
  if (!root.contains(node)) return { node, offset };

  // Inside root → do not store the Text Node; it dies when textContent is set.
  // Range endpoint is typed as Node because that is what Selection uses.
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return { textOffset: range.toString().length };
}

/**
 * Resolves a saved point back to a live `[Node, offset]` for setBaseAndExtent.
 *
 * - External `{ node, offset }` → returned as-is (still a Node, often Text).
 * - Internal `{ textOffset }` → walk `root`'s current Text nodes (SHOW_TEXT)
 *   and stop when the remaining offset fits inside one. Those are the *new*
 *   Text nodes created by the rewrite, not the ones from before save.
 *
 * Empty `root` has no Text child; the HTMLElement itself accepts offset 0.
 *
 * @param root - Editable HTMLElement that now holds the replacement text.
 * @param point - Value previously produced by {@link savePoint}.
 */
function restorePoint(root: HTMLElement, point: SavedPoint): [Node, number] {
  let restored: [Node, number];
  if ("node" in point) return [point.node, point.offset];

  // Walk Text nodes only — character Nodes under root, not Element tags.
  const walker = root.ownerDocument.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  let remaining = point.textOffset;
  let textNode = walker.nextNode();
  // Empty editable: no Text node, but the element itself accepts
  // a child offset of zero as a valid caret position.
  restored = [root, 0];

  while (textNode) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) {
      restored = [textNode, remaining];
      break;
    }
    remaining -= length;
    textNode = walker.nextNode();
  }

  return restored;
}

/**
 * Saves the current DOM selection when at least one endpoint is inside `root`.
 *
 * Endpoints inside the editable HTMLElement become character offsets because
 * assigning `textContent` replaces their Text nodes. Endpoints outside keep
 * their live `{ node, offset }`, which also preserves cross-block selections.
 *
 * @param root - Editable HTMLElement whose text nodes may be replaced.
 * @returns Saved selection, or null when the document selection is unrelated.
 */
export function saveDOMSelection(root: HTMLElement): SavedDOMSelection | null {
  const selection = root.ownerDocument.getSelection();
  // anchorNode / focusNode are Node|null — typically Text inside contenteditable.
  if (!selection?.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) && !root.contains(selection.focusNode)) return null;

  return {
    anchor: savePoint(root, selection.anchorNode, selection.anchorOffset),
    focus: savePoint(root, selection.focusNode, selection.focusOffset),
  };
}

/**
 * Restores a selection after the editable element's Text nodes were replaced.
 *
 * Remaps saved character offsets onto the new Text nodes under `root`, then
 * calls `setBaseAndExtent` with live Nodes. A disconnected external endpoint
 * can occur if another React update removed a selected block — in that case
 * the catch leaves the browser selection unchanged instead of throwing during
 * document sync.
 *
 * @param root - Editable HTMLElement containing the replacement Text nodes.
 * @param saved - Selection previously returned by {@link saveDOMSelection}.
 */
export function restoreDOMSelection(root: HTMLElement, saved: SavedDOMSelection | null): void {
  if (!saved) return;

  const selection = root.ownerDocument.getSelection();
  if (!selection) return;

  // Each end is [Node, offset] — Node is usually Text after restorePoint.
  const [anchorNode, anchorOffset] = restorePoint(root, saved.anchor);
  const [focusNode, focusOffset] = restorePoint(root, saved.focus);

  try {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  } catch {
    // A selection endpoint outside `root` may have been removed concurrently.
  }
}
