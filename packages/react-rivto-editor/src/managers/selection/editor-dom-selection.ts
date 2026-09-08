/**
 * DOM ↔ editor selection bridge for Rivto's multi-contenteditable surfaces.
 *
 * ## DOM vocabulary (why helpers take Node vs HTMLElement)
 *
 * Inheritance (each row is a more specific kind of the row above):
 *
 * ```text
 * Node          — anything in the DOM tree
 *  └── Element      — a tag (`<div>`, `<span>`, `<svg>`, …)
 *       └── HTMLElement — an HTML tag (has focus(), dataset, contentEditable, …)
 * ```
 *
 * Important: character content is also a Node. Markup like
 * `<div>hello</div>` is not “a div with a string property”; the browser
 * builds a real child object:
 *
 * ```text
 * HTMLElement <div>          ← Element (and HTMLElement)
 *   └── Text "hello"         ← Node, but NOT an Element
 * ```
 *
 * That Text object is what `Selection.anchorNode` usually points at, with
 * `anchorOffset` as a character index inside it (e.g. offset 2 = between
 * `e` and `l`). Selection APIs need an object to point at; a plain string
 * field on the parent would not work.
 *
 * Quick map used throughout this file:
 *
 * | Type         | Meaning                         | Example              | Has closest()? |
 * |--------------|---------------------------------|----------------------|----------------|
 * | Node         | Any tree piece                  | Text, Element, …    | no (not always)|
 * | Element      | A tag node                      | `<div>`, `<svg>`     | yes            |
 * | HTMLElement  | An HTML tag                     | block / block content  | yes + HTML APIs|
 * | Text         | Character content (a Node)      | `"hello"`            | no             |
 *
 * So:
 * - `node: Node` → caret target (usually Text; sometimes the content Element).
 * - `content` / `root: HTMLElement` → HTML hosts we query with selectors /
 *   `closest()` / `focus()`.
 *
 * Typical Rivto tree:
 *
 * ```text
 * HTMLElement (editor root)
 * └── HTMLElement (block host, data-block-id)
 *     └── HTMLElement (block content, contenteditable)
 *         └── Text ("hello")   ← Selection often points here
 * ```
 */

import type {
  EditorPosition,
  EditorSelection,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  TEXT_SELECTION_FALLBACK_SELECTOR,
} from "../../constants";
import { isElementNode } from "../events/dom-nodes";

/**
 * One live browser caret/selection endpoint inside a block's editable content.
 *
 * Used while dragging across separate `contenteditable` hosts, where a single
 * native Range is unreliable. Pair two of these and pass them to
 * {@link setNativeSelection}.
 *
 * Mirrors what `Selection.setBaseAndExtent` wants: a Node + offset for each
 * end, plus Rivto's owning content HTMLElement so we know which block host
 * the endpoint belongs to.
 */
export interface DOMSelectionPoint {
  /**
   * Live DOM node the caret sits in (typed as Node, not Element).
   *
   * Usually a Text node — character content is a real tree Node, e.g. the
   * `"hello"` child of `<div>hello</div>`. May be the content Element itself
   * when the block is empty or hit-testing falls back to the host.
   */
  readonly node: Node;
  /**
   * Offset inside `node` (meaning depends on what `node` is).
   *
   * - Text node → character index (0 … text.length).
   * - Element → child-index style offset (0 = before first child).
   */
  readonly offset: number;
  /**
   * Owning editable host (`[data-block-content]`).
   *
   * An HTMLElement (HTML tag), not a Text node — this is the contenteditable
   * container we can `focus()`, query, and map back to a `blockId`.
   */
  readonly content: HTMLElement;
}

/**
 * Minimal visible-block snapshot used when splitting a cross-block text
 * selection into a text item plus a middle "fully selected blocks" item.
 */
export interface SelectionBlock {
  /** Stable block identity (`data-block-id`) in visible document order. */
  readonly id: string;
  /** Current plain-text length in UTF-16 code units (`textContent.length`). */
  readonly length: number;
}

/** Name used by surfaces that style the supplemental CSS Highlight range. */
export const TEXT_SELECTION_HIGHLIGHT_NAME = "rivto-text-selection";

/**
 * Reads the stable block ID that owns one editable content element.
 *
 * @param content - A `[data-block-content]` HTMLElement (or a descendant of one).
 * @returns The nearest ancestor's `data-block-id`, or `undefined` if missing.
 */
function blockIdForContent(content: HTMLElement): string | undefined {
  return content.closest<HTMLElement>(BLOCK_ID_SELECTOR)?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined;
}

/**
 * Returns every editable content host under `root` in visible DOM order.
 *
 * @param root - EditorView root Element that scopes the query.
 * @returns HTMLElements matching `[data-block-content]` that have a block ID.
 */
function orderedContents(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)].filter((content) => (
    Boolean(blockIdForContent(content))
  ));
}

/**
 * Builds portable selection items from two directed editor positions.
 *
 * The text item retains the real pointer direction and exact boundary offsets.
 * Blocks strictly between those endpoints are fully covered, so a second block
 * item records them explicitly. `blockIds` stay in document order while its
 * anchor/focus preserve whether the gesture moved top-down or bottom-up.
 *
 * @param blocks - Visible editable blocks in document order.
 * @param anchor - Fixed position where the gesture began.
 * @param head - Moving position where the gesture currently ends.
 * @returns One directed text item and, when needed, one middle-block item.
 */
export function createSelectionItems(
  blocks: readonly SelectionBlock[],
  anchor: EditorPosition,
  head: EditorPosition,
): EditorSelection {
  const text = { type: "text", anchor: { ...anchor }, head: { ...head } } as const;
  const anchorIndex = blocks.findIndex((block) => block.id === anchor.blockId);
  const headIndex = blocks.findIndex((block) => block.id === head.blockId);
  if (anchorIndex < 0 || headIndex < 0 || anchorIndex === headIndex) return [text];

  const first = Math.min(anchorIndex, headIndex) + 1;
  const last = Math.max(anchorIndex, headIndex);
  const blockIds = blocks.slice(first, last).map((block) => block.id);
  if (!blockIds.length) return [text];

  const forward = anchorIndex < headIndex;
  return [
    text,
    {
      type: "block",
      blockIds,
      anchorBlockId: forward ? blockIds[0]! : blockIds.at(-1)!,
      focusBlockId: forward ? blockIds.at(-1)! : blockIds[0]!,
    },
  ];
}

/**
 * Creates one inclusive whole-block range in visible order.
 *
 * Unlike a text range, both endpoint blocks are complete selections. The ID
 * array remains top-down while anchor/focus retain gesture direction.
 *
 * @param blockIds - Candidate block IDs already in visible document order.
 * @param anchorBlockId - Block where the gesture began.
 * @param focusBlockId - Block where the gesture currently ends.
 * @returns A one-item block selection, or `[]` when either ID is unknown.
 */
export function createBlockSelection(
  blockIds: readonly string[],
  anchorBlockId: string,
  focusBlockId: string,
): EditorSelection {
  const anchorIndex = blockIds.indexOf(anchorBlockId);
  const focusIndex = blockIds.indexOf(focusBlockId);
  if (anchorIndex < 0 || focusIndex < 0) return [];
  return [{
    type: "block",
    blockIds: blockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1),
    anchorBlockId,
    focusBlockId,
  }];
}

/**
 * Returns every rendered BlockView ID in visible depth-first DOM order.
 *
 * @param root - EditorView root Element that scopes the query.
 */
export function orderedBlockIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)].flatMap((block) => {
    const blockId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    return blockId ? [blockId] : [];
  });
}

/**
 * Maps one browser selection endpoint to a portable `{ blockId, offset }`.
 *
 * Core DOM → editor conversion. The browser gives a live caret as
 * `(Node, offset)`; Rivto stores a stable `(blockId, plain-text offset)` that
 * survives React replacing Text nodes.
 *
 * Logic:
 * 1. `node` is often a Text node (characters are Nodes — see file header).
 *    Text is not an Element, so it has no `closest()`. Climb to an Element
 *    first (`node` itself if it is already an Element, else `parentElement`).
 * 2. From that Element, find the owning `[data-block-content]` HTMLElement and
 *    read its `data-block-id`.
 * 3. Build a Range from the start of that content up to `(node, offset)`.
 *    `range.toString().length` is the UTF-16 plain-text offset — same unit as
 *    `EditorPosition.offset`. The Range endpoint stays typed as Node because
 *    that is what the browser Selection API uses.
 *
 * @param root - EditorView root HTMLElement; endpoints outside it are rejected.
 * @param node - `Selection.anchorNode` / `focusNode`: usually Text, sometimes
 *   Element, or `null` when there is no selection.
 * @param offset - `Selection.anchorOffset` / `focusOffset` inside `node`.
 * @returns Portable position, or `undefined` when the endpoint is outside this
 *   editor, has no block content host, or the Range API rejects a stale node
 *   (common right after React replaces Text nodes).
 */
function readPosition(root: HTMLElement, node: Node | null, offset: number): EditorPosition | undefined {
  // node is Node|null. Text ("hello") is a Node but not an Element — only
  // Elements have closest()/querySelector. Climb to a tag Element first:
  //   <div contenteditable>          ← Element / HTMLElement
  //     #text "hello"  ← node here   ← Text (Node, not Element) → use parentElement
  const element = isElementNode(node) ? node : node?.parentElement;
  const content = element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  const blockId = content ? blockIdForContent(content) : undefined;
  if (!node || !content || !blockId || !root.contains(content)) return;

  // Measure "how many characters from content start to (node, offset)".
  // setEnd accepts a Node (Text or Element), matching Selection's model.
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(node, offset);
  } catch {
    // React often replaces Text nodes on rerender; Selection may still point
    // at a detached Node that Range rejects.
    return;
  }
  return { blockId, offset: range.toString().length };
}

/**
 * Converts one resolved {@link DOMSelectionPoint} to stable editor coordinates.
 *
 * @param root - EditorView root that must own `point.content`.
 * @param point - Live DOM endpoint (node + offset + content host).
 */
export function readDOMPointPosition(root: HTMLElement, point: DOMSelectionPoint): EditorPosition | undefined {
  return readPosition(root, point.node, point.offset);
}

/**
 * Resolves the visible block container directly beneath viewport coordinates.
 *
 * Unlike {@link readDOMSelectionPoint}, this helper does not require editable
 * content. It therefore resolves contentless custom blocks such as Counter,
 * which still participate in structural pointer selection.
 *
 * The closest block is used because nested surfaces render one BlockView inside
 * another. A pointer over a child control must select that child, not its parent.
 *
 * @param root - Active surface root that scopes valid block containers.
 * @param x - Horizontal viewport coordinate from a pointer event.
 * @param y - Vertical viewport coordinate from a pointer event.
 * @returns Stable block ID under the pointer, or undefined outside a block.
 */
export function readBlockIdAtPoint(
  root: HTMLElement,
  x: number,
  y: number,
): string | undefined {
  const hit = root.ownerDocument.elementFromPoint(x, y);
  const block = hit?.closest<HTMLElement>(BLOCK_ID_SELECTOR);
  if (!block || !root.contains(block)) return undefined;
  return block.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined;
}

/**
 * Builds a portable {@link EditorSelection} from two editor positions, using
 * the surface's current visible block order under `root`.
 *
 * @param root - EditorView root used to discover visible blocks / lengths.
 * @param anchor - Fixed position where the gesture began.
 * @param head - Moving position where the gesture currently ends.
 */
export function createDOMSelectionItems(
  root: HTMLElement,
  anchor: EditorPosition,
  head: EditorPosition,
): EditorSelection {
  const blocks = orderedContents(root).flatMap((content) => {
    const id = blockIdForContent(content);
    return id ? [{ id, length: content.textContent?.length ?? 0 }] : [];
  });
  return createSelectionItems(blocks, anchor, head);
}

/**
 * Reads `window.getSelection()` when both endpoints belong to this editor root.
 *
 * Anchor and focus are read independently instead of using Range start/end.
 * A Range normalizes endpoints into document order and would lose the
 * direction of a bottom-to-top selection.
 *
 * @param root - EditorView root; both endpoints must live under it.
 * @returns Directed selection items, or `undefined` when there is no usable
 *   browser selection inside this editor.
 */
export function readEditorDOMSelection(root: HTMLElement): EditorSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  // anchorNode / focusNode are Node|null — typically Text nodes inside a
  // contenteditable HTMLElement, not the Element itself.
  const anchor = readPosition(root, selection.anchorNode, selection.anchorOffset);
  const head = readPosition(root, selection.focusNode, selection.focusOffset);
  return anchor && head ? createDOMSelectionItems(root, anchor, head) : undefined;
}

/**
 * Euclidean distance from a viewport point to the nearest point inside `rect`.
 * Zero when `(x, y)` is already inside the rectangle.
 *
 * @param rect - Element bounding box in viewport coordinates.
 * @param x - Client X (e.g. `PointerEvent.clientX`).
 * @param y - Client Y (e.g. `PointerEvent.clientY`).
 */
function distanceToRect(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Finds the editable content under the pointer, or the nearest one in a gap.
 *
 * @param root - EditorView root that scopes ownership.
 * @param x - Client X in viewport pixels.
 * @param y - Client Y in viewport pixels.
 * @returns The hit `[data-block-content]` Element, or the closest one by distance.
 */
function contentNearPoint(root: HTMLElement, x: number, y: number): HTMLElement | undefined {
  const hit = root.ownerDocument.elementFromPoint(x, y)?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  if (hit && root.contains(hit)) return hit;
  return orderedContents(root)
    .map((content) => ({ content, distance: distanceToRect(content.getBoundingClientRect(), x, y) }))
    .sort((left, right) => left.distance - right.distance)[0]?.content;
}

/**
 * Brute-force caret lookup inside one content Element when browser hit-testing
 * fails (common when focus is in a different contenteditable).
 *
 * Walks every Text node under `content` (SHOW_TEXT — character Nodes only,
 * not Element tags), measures a collapsed Range rect at each character
 * offset, and picks the closest to `(x, y)`.
 *
 * @param content - Editable block-content HTMLElement to scan.
 * @param x - Client X in viewport pixels.
 * @param y - Client Y in viewport pixels.
 * @returns Best DOM endpoint; falls back to `(content Element, 0)` when empty.
 */
function nearestTextPoint(content: HTMLElement, x: number, y: number): DOMSelectionPoint {
  const document = content.ownerDocument;
  // Walk Text nodes only. Each visited `node` is a Node (#text), not an Element.
  const walker = document.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
  let best: DOMSelectionPoint | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let offset = 0; offset <= text.length; offset += 1) {
      const range = document.createRange();
      // Caret at character `offset` inside this Text node.
      range.setStart(node, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const distance = Math.hypot(x - rect.left, y - (rect.top + rect.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { node, offset, content };
      }
    }
  }
  // Empty block: no Text children — use the content HTMLElement as the Node.
  return best ?? { node: content, offset: 0, content };
}

/**
 * Resolves the nearest selectable DOM endpoint at viewport coordinates.
 *
 * Prefer the browser's caret hit-test:
 * - Firefox: `document.caretPositionFromPoint` → `{ offsetNode, offset }`
 * - Chromium: `document.caretRangeFromPoint` → Range start container/offset
 *
 * Those APIs return a Node (often Text) plus an offset. When the hit falls
 * outside the target content (or the browser only hit-tests the focused
 * contenteditable), {@link nearestTextPoint} scans text nodes locally.
 *
 * @param root - EditorView root that scopes which content hosts are valid.
 * @param x - Client X in viewport pixels.
 * @param y - Client Y in viewport pixels.
 * @returns Live `{ node, offset, content }`, or `undefined` if no content host exists.
 */
export function readDOMSelectionPoint(root: HTMLElement, x: number, y: number): DOMSelectionPoint | undefined {
  const content = contentNearPoint(root, x, y);
  if (!content) return;
  const document = root.ownerDocument;
  const caret = document.caretPositionFromPoint?.(x, y);
  const fallback = (document as Document & { caretRangeFromPoint?: (left: number, top: number) => Range | null })
    .caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? fallback?.startContainer;
  const offset = caret?.offset ?? fallback?.startOffset;
  let point: DOMSelectionPoint;
  if (node && offset !== undefined && content.contains(node)) {
    point = { node, offset, content };
  } else {
    point = nearestTextPoint(content, x, y);
  }
  return point;
}

/**
 * Displays a directed native selection across separate contenteditable hosts.
 *
 * `Selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)`
 * preserves upward (bottom→top) selection direction. When a browser rejects
 * cross-host endpoints, a normalized Range still paints something; the
 * portable editor selection list remains the source of truth for direction.
 *
 * @param anchor - Fixed endpoint (where the gesture began).
 * @param head - Moving endpoint (where the gesture currently ends).
 */
export function setNativeSelection(anchor: DOMSelectionPoint, head: DOMSelectionPoint): void {
  const selection = anchor.content.ownerDocument.getSelection();
  if (!selection) return;
  let restored = false;
  try {
    // Ends are Nodes (usually Text), not HTMLElements — same model as getSelection().
    selection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    restored = true;
  } catch {
    // Fall through to a normalized Range for detached/browser-rejected points.
  }

  if (!restored) {
    // Range requires document order; compareDocumentPosition works on any Node
    // (Text or Element), which is why endpoints stay typed as Node.
    const anchorBeforeHead = anchor.node === head.node
      ? anchor.offset <= head.offset
      : Boolean(anchor.node.compareDocumentPosition(head.node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const start = anchorBeforeHead ? anchor : head;
    const end = anchorBeforeHead ? head : anchor;
    const range = anchor.content.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Resolves a plain-text character offset back to a live DOM `{ node, offset }`.
 *
 * Inverse of {@link readPosition}:
 * - `readPosition`: live `(Text|Element Node, offset)` → `{ blockId, offset }`
 * - `pointAtOffset`: `{ blockId, offset }` → live `(Text Node, offset)` again
 *
 * Walks Text nodes under `content` in document order and subtracts each
 * node's length until `requestedOffset` lands inside one. That Node is what
 * `Selection.setBaseAndExtent` / `Range.setStart` need — not the parent
 * HTMLElement (unless the block has no text).
 *
 * @param content - Editable `[data-block-content]` HTMLElement to walk.
 * @param requestedOffset - UTF-16 offset from the start of that content's text.
 * @returns A Node (usually Text) plus offset inside it.
 */
function pointAtOffset(content: HTMLElement, requestedOffset: number): { node: Node; offset: number } {
  // SHOW_TEXT → only Text nodes ("hello"), skipping Element tags in between.
  const walker = content.ownerDocument.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
  let remaining = Math.max(0, requestedOffset);
  let last: Node | undefined;
  let point: { node: Node; offset: number } | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      point = { node, offset: remaining };
      break;
    }
    remaining -= length;
  }
  // Past the end → clamp to last Text node; empty content → content Element.
  if (!point) {
    point = last
      ? { node: last, offset: last.textContent?.length ?? 0 }
      : { node: content, offset: 0 };
  }
  return point;
}

/**
 * Resolves one portable editor position to its current live DOM endpoint.
 *
 * Finds the rendered content Element for `position.blockId`, then maps the
 * plain-text offset onto a live Text (or Element) node via {@link pointAtOffset}.
 *
 * @param root - EditorView root used to find the block's content host.
 * @param position - Stable `{ blockId, offset }` from the editor model.
 * @returns Live {@link DOMSelectionPoint}, or `undefined` if that block is not rendered.
 */
export function resolveDOMSelectionPoint(root: HTMLElement, position: EditorPosition): DOMSelectionPoint | undefined {
  const content = orderedContents(root).find((candidate) => blockIdForContent(candidate) === position.blockId);
  return content ? { ...pointAtOffset(content, position.offset), content } : undefined;
}

/**
 * Restores the browser range represented by an editor text selection.
 *
 * Structural commands can preserve block IDs and text offsets while React
 * reparents their DOM elements. The browser range still points at the detached
 * nodes and is commonly cleared. This helper resolves both stored endpoints
 * against the newly rendered content elements, focuses the moving endpoint,
 * and recreates the directed native selection. Supplemental cross-block
 * highlighting is repainted at the same time.
 *
 * Whole-block selections have no native text range, so they return
 * false without changing focus. Missing rendered endpoints also return false;
 * callers can safely retry after a later render.
 *
 * @param root - Active EditorView root containing the rendered block content.
 * @param selection - Editor selection captured before the structural command.
 * @returns True when a text selection was resolved and restored.
 */
export function restoreEditorDOMSelection(root: HTMLElement, selection: EditorSelection): boolean {
  const text = selection.find((item) => item.type === "text");
  if (!text) return false;

  const contents = orderedContents(root);
  const anchorContent = contents.find((content) => blockIdForContent(content) === text.anchor.blockId);
  const headContent = contents.find((content) => blockIdForContent(content) === text.head.blockId);
  if (!anchorContent || !headContent) return false;

  const anchor = pointAtOffset(anchorContent, text.anchor.offset);
  const head = pointAtOffset(headContent, text.head.offset);
  headContent.focus({ preventScroll: true });
  setNativeSelection(
    { ...anchor, content: anchorContent },
    { ...head, content: headContent },
  );
  updateTextSelectionHighlight(root, selection);
  return true;
}

/**
 * Removes supplemental CSS Highlight ranges and fallback DOM paint markers.
 *
 * @param root - EditorView root whose highlight state should be cleared.
 */
export function clearTextSelectionHighlight(root: HTMLElement): void {
  if ("highlights" in CSS) CSS.highlights.delete(TEXT_SELECTION_HIGHLIGHT_NAME);
  root.querySelectorAll<HTMLElement>(TEXT_SELECTION_FALLBACK_SELECTOR).forEach((content) => {
    delete content.dataset.textSelectionFallback;
  });
}

/**
 * Paints cross-contenteditable text that browsers may omit from native paint.
 *
 * Each block is its own `contenteditable`, so a native selection often only
 * highlights the focused host. This helper paints the rest:
 * - Prefer the CSS Custom Highlight API (`CSS.highlights`) with exact Ranges
 *   for partial boundary offsets.
 * - Fall back to `data-text-selection-fallback` on touched content elements
 *   for engines without Highlights. Surfaces own the visual styling.
 *
 * @param root - EditorView root that owns the content hosts.
 * @param selection - Portable selection; only cross-block text items paint.
 */
export function updateTextSelectionHighlight(root: HTMLElement, selection: EditorSelection): void {
  clearTextSelectionHighlight(root);
  const text = selection.find((item) => item.type === "text");
  if (!text || text.anchor.blockId === text.head.blockId) return;

  const contents = orderedContents(root);
  const anchorIndex = contents.findIndex((content) => blockIdForContent(content) === text.anchor.blockId);
  const headIndex = contents.findIndex((content) => blockIdForContent(content) === text.head.blockId);
  if (anchorIndex < 0 || headIndex < 0) return;

  const forward = anchorIndex < headIndex;
  const firstIndex = Math.min(anchorIndex, headIndex);
  const lastIndex = Math.max(anchorIndex, headIndex);
  const firstOffset = forward ? text.anchor.offset : text.head.offset;
  const lastOffset = forward ? text.head.offset : text.anchor.offset;
  const ranges: Range[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const content = contents[index]!;
    const start = pointAtOffset(content, index === firstIndex ? firstOffset : 0);
    const end = pointAtOffset(content, index === lastIndex ? lastOffset : content.textContent?.length ?? 0);
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }

  if ("highlights" in CSS && typeof Highlight !== "undefined") {
    CSS.highlights.set(TEXT_SELECTION_HIGHLIGHT_NAME, new Highlight(...ranges));
  } else {
    contents.slice(firstIndex, lastIndex + 1).forEach((content) => {
      content.dataset.textSelectionFallback = "true";
    });
  }
}
