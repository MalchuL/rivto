import { BlockSelectionEndpoints } from "./block-selection-endpoints";
import { BlockVirtualizationController } from "../virtualization/block-virtualization-controller";
import type { BlockEditorSelection } from "../../adapter/types";
import type {
  BlockSelectionPosition as EditorPosition,
  BlockSelectionSnapshot as Selection,
} from "./types";
import { BlockSelectionRanges } from "./block-selection-ranges";
import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
const BLOCK_CONTENT_SELECTOR = "[data-block-content]";
const BLOCK_ID_SELECTOR = "[data-block-id]";
const BLOCK_ID_ATTRIBUTE = "data-block-id";
const PANEL_SELECTOR = "[data-rivto-block-editor]";
const BLOCK_ROW_CLASS = BLOCK_EDITOR_CLASSES.row;
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
/** Native node endpoint, before resolving its owning content host. */
interface DOMPoint {
  readonly node: Node;
  readonly offset: number;
}
/** Browser document exposing WebKit's fallback caret hit test. */
interface CaretDocument extends Document {
  /**
   * Resolves a native range at viewport coordinates in browsers providing this fallback.
   *
   * @param left - Horizontal viewport coordinate in CSS pixels.
   * @param top - Vertical viewport coordinate in CSS pixels.
   * @returns Browser range, or null when no caret can be resolved.
   */
  caretRangeFromPoint(left: number, top: number): Range | null;
}
/** Measured candidate used only for wrapping-parent margin hits. */
interface NearbyBlock {
  readonly candidate: HTMLElement;
  readonly distance: number;
}

/** Maps native DOM ranges to host-owned portable block selection. */
export class BlockDOMSelection {
  /**
   * Binds DOM conversion to host-owned ordering and text lengths.
   *
   * @param selection - Borrowed selection data capability.
   */
  constructor(
    private readonly selection: Pick<
      BlockEditorSelection,
      "getSelectableBlockIds" | "getTextLength"
    >,
  ) {}

  /**
   * Creates one inclusive whole-block range in visible order.
   *
   * @param blockIds - Candidate block IDs already in visible document order.
   * @param anchorBlockId - Block where the gesture began.
   * @param focusBlockId - Block where the gesture currently ends.
   * @returns A one-item block selection, or `[]` when either ID is unknown.
   */
  createVisibleStructuralSelection(
    blockIds: readonly string[],
    anchorBlockId: string,
    focusBlockId: string,
  ): Selection | undefined {
    const anchorIndex = blockIds.indexOf(anchorBlockId);
    const focusIndex = blockIds.indexOf(focusBlockId);
    if (anchorIndex < 0 || focusIndex < 0) {
      return undefined;
    }
    return BlockSelectionRanges.createStructuralSelection(
      blockIds.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1),
      anchorBlockId,
      focusBlockId,
    );
  }

  /**
   * Converts one resolved {@link DOMSelectionPoint} to stable editor coordinates.
   *
   * @param root - EditorPanel root that must own `point.content`.
   * @param point - Live DOM endpoint (node + offset + content host).
   */
  readDOMPointPosition(root: HTMLElement, point: DOMSelectionPoint): EditorPosition | undefined {
    return this.readPosition(root, point.node, point.offset);
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
   * Nested parents also wrap descendant geometry: vertical sibling margins and
   * the indent gutter are still inside the parent BlockView. `elementFromPoint`
   * therefore reports the parent when the pointer is only between nested rows.
   * That hit is valid CSS, but whole-block drags would then promote the parent
   * and cover its entire subtree. Hits outside the parent's own row snap to the
   * nearest nested row instead, so the parent joins the range only when the
   * pointer enters its content or chrome. Registered body slots also belong to
   * the block itself, rather than its ordinary outline descendants. Hits inside
   * another nested panel resolve to the enclosing block in this surface, keeping
   * the originating selection gesture within its own document occurrence.
   *
   * @param root - Active surface root that scopes valid block containers.
   * @param x - Horizontal viewport coordinate from a pointer event.
   * @param y - Vertical viewport coordinate from a pointer event.
   * @returns Stable block ID under the pointer, or undefined outside a block.
   */
  readBlockIdAtPoint(root: HTMLElement, x: number, y: number): string | undefined {
    const hit = root.ownerDocument.elementFromPoint(x, y);
    // A nested panel is one block in the originating surface. Its source rows
    // must not turn a host selection endpoint into a nearby editable sibling.
    const block = this.getBlock(root, this.isElement(hit) ? hit : null);
    if (!block || !root.contains(block)) {
      return undefined;
    }

    const ownRow = this.ownedBlockRow(block);
    // Keep the closest block when the pointer is in its own row, or when a
    // custom shell has no row to distinguish wrapping descendants from chrome.
    // Body slots belong to that block even when it also has outline children.
    const ownBody = block.querySelector<HTMLElement>(':scope > [data-slot-position="body"]');
    const nestedHit =
      ownRow && !ownRow.contains(hit) && !ownBody?.contains(hit)
        ? this.nearestNestedBlock(block, x, y)
        : undefined;
    const target = nestedHit ?? block;
    return target.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined;
  }

  /**
   * Builds a portable {@link Selection} from two editor positions, using
   * the host's selectable order, including unmounted blocks.
   *
   * Only the covered interval reads text lengths. Undefined lengths identify
   * contentless blocks even when they have no DOM; zero still denotes editable
   * empty text. Contentless ranges use whole-block markers, while text ranges
   * retain concrete offsets and directed endpoints. Mounted renderer availability
   * does not alter coverage, so windowing never changes the stored selection.
   *
   * @param anchor - Fixed position where the gesture began.
   * @param head - Moving position where the gesture currently ends.
   * @returns Directed text coverage with structural markers for contentless blocks.
   */
  createSelection(anchor: EditorPosition, head: EditorPosition): Selection | undefined {
    const ids = this.selection.getSelectableBlockIds();
    const anchorIndex = ids.indexOf(anchor.blockId);
    const headIndex = ids.indexOf(head.blockId);
    if (anchorIndex < 0 || headIndex < 0) {
      return undefined;
    }
    const contentless = new Set<string>();
    const ordered = ids
      .slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1)
      .map((id) => {
        const length = this.selection.getTextLength(id);
        if (length === undefined) {
          contentless.add(id);
        }
        return { id, length: length ?? 0 };
      });
    const selection = BlockSelectionRanges.createTextSelection(ordered, anchor, head);
    if (!selection) {
      return undefined;
    }
    return {
      ...selection,
      blocks: selection.blocks.map((block) =>
        contentless.has(block.id) ? { id: block.id, start: 0, end: -1 } : block,
      ),
    };
  }

  /**
   * Reads `window.getSelection()` when both endpoints belong to this editor root.
   *
   * Anchor and focus are read independently instead of using Range start/end.
   * A Range normalizes endpoints into document order and would lose the
   * direction of a bottom-to-top selection.
   *
   * @param root - EditorPanel root; both endpoints must live under it.
   * @returns Directed selection, or `undefined` when there is no usable
   *   browser selection inside this editor.
   */
  readEditorDOMSelection(root: HTMLElement): Selection | undefined {
    const selection = root.ownerDocument.getSelection();
    if (!selection?.rangeCount) {
      return;
    }
    // anchorNode / focusNode are Node|null — typically Text nodes inside a
    // contenteditable HTMLElement, not the Element itself.
    const anchor = this.readPosition(root, selection.anchorNode, selection.anchorOffset);
    const head = this.readPosition(root, selection.focusNode, selection.focusOffset);
    return anchor && head ? this.createSelection(anchor, head) : undefined;
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
   * @param root - EditorPanel root that scopes which content hosts are valid.
   * @param x - Client X in viewport pixels.
   * @param y - Client Y in viewport pixels.
   * @returns Live `{ node, offset, content }`, or `undefined` if no content host exists.
   */
  readDOMSelectionPoint(root: HTMLElement, x: number, y: number): DOMSelectionPoint | undefined {
    const content = this.contentNearPoint(root, x, y);
    if (!content) {
      return;
    }
    const document = root.ownerDocument;
    const caret = document.caretPositionFromPoint?.(x, y);
    const fallback = (document as CaretDocument).caretRangeFromPoint?.(x, y);
    const node = caret?.offsetNode ?? fallback?.startContainer;
    const offset = caret?.offset ?? fallback?.startOffset;
    let point: DOMSelectionPoint;
    if (node && offset !== undefined && content.contains(node)) {
      point = { node, offset, content };
    } else {
      point = this.nearestTextPoint(content, x, y);
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
  setNativeSelection(anchor: DOMSelectionPoint, head: DOMSelectionPoint): void {
    const selection = anchor.content.ownerDocument.getSelection();
    if (!selection) {
      return;
    }
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
      const anchorBeforeHead =
        anchor.node === head.node
          ? anchor.offset <= head.offset
          : Boolean(
              anchor.node.compareDocumentPosition(head.node) & Node.DOCUMENT_POSITION_FOLLOWING,
            );
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
   * Resolves one portable editor position to its current live DOM endpoint.
   *
   * Finds the rendered content Element for `position.blockId`, then maps the
   * plain-text offset onto a live Text (or Element) node via {@link pointAtOffset}.
   * An active virtual view first mounts the expanded subtree synchronously without
   * scrolling. Collapsed or missing blocks remain unresolved; call outside React render.
   *
   * @param root - BlockEditor root used to find the block's content host.
   * @param position - Stable `{ blockId, offset }` from the editor model.
   * @returns Live {@link DOMSelectionPoint}, or `undefined` if that block remains unrendered.
   * @throws Propagates host hierarchy reads and synchronous mounting failures.
   */
  resolveDOMSelectionPoint(
    root: HTMLElement,
    position: EditorPosition,
  ): DOMSelectionPoint | undefined {
    let content = this.findContent(root, position.blockId);
    if (!content) {
      BlockVirtualizationController.getForRoot(root)?.mountBlocks([position.blockId]);
      content = this.findContent(root, position.blockId);
    }
    return content ? { ...this.pointAtOffset(content, position.offset), content } : undefined;
  }
  /**
   * Restores the browser range represented by an editor text selection.
   *
   * Structural commands can preserve block IDs and text offsets while React
   * reparents their DOM elements. The browser range still points at the detached
   * nodes and is commonly cleared. This helper resolves both stored endpoints
   * against the newly rendered content elements, focuses the moving endpoint,
   * and recreates the directed native selection inside that block.
   *
   * Whole-block selections have no native text range, so they return
   * false without changing focus. Missing rendered endpoints also return false;
   * callers can safely retry after a later render. Callers mount surface-specific
   * endpoints before invoking this method.
   *
   * @param root - Active EditorPanel root containing the rendered block content.
   * @param selection - Editor selection captured before the structural command.
   *
   * @returns True when a text selection was resolved and restored.
   */
  restoreEditorDOMSelection(root: HTMLElement, selection: Selection): boolean {
    if (BlockSelectionRanges.isStructuralSelection(selection)) {
      return false;
    }
    const ends = BlockSelectionEndpoints.resolve(
      selection,
      (id) => this.findContent(root, id)?.textContent?.length ?? 0,
    );
    if (!ends) {
      return false;
    }
    const anchor = this.resolveDOMSelectionPoint(root, ends.anchor);
    const head = this.resolveDOMSelectionPoint(root, ends.head);
    if (!anchor || !head) {
      return false;
    }
    head.content.focus({ preventScroll: true });
    this.setNativeSelection(anchor, head);
    return true;
  }
  /**
   * Reads the stable block ID that owns one editable content element.
   *
   * @param content - A `[data-block-content]` HTMLElement (or a descendant of one).
   * @returns The nearest ancestor's `data-block-id`, or `undefined` if missing.
   */
  private blockIdForContent(content: HTMLElement): string | undefined {
    return (
      content.closest<HTMLElement>(BLOCK_ID_SELECTOR)?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined
    );
  }

  /**
   * Returns every editable content host under `root` in visible DOM order.
   *
   * @param root - EditorPanel root Element that scopes the query.
   * @returns HTMLElements matching `[data-block-content]` that have a block ID.
   */
  private orderedContents(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR)].filter(
      (content) => Boolean(this.blockIdForContent(content)) && this.contains(root, content),
    );
  }

  /**
   * Returns every rendered BlockView ID in visible depth-first DOM order.
   *
   * @param root - EditorPanel root Element that scopes the query.
   */
  private orderedBlockIds(_root: HTMLElement): readonly string[] {
    return this.selection.getSelectableBlockIds();
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
   * @param root - EditorPanel root HTMLElement; endpoints outside it are rejected.
   * @param node - `Selection.anchorNode` / `focusNode`: usually Text, sometimes
   *   Element, or `null` when there is no selection.
   * @param offset - `Selection.anchorOffset` / `focusOffset` inside `node`.
   * @returns Portable position, or `undefined` when the endpoint is outside this
   *   editor, has no block content host, or the Range API rejects a stale node
   *   (common right after React replaces Text nodes).
   */
  private readPosition(
    root: HTMLElement,
    node: Node | null,
    offset: number,
  ): EditorPosition | undefined {
    // node is Node|null. Text ("hello") is a Node but not an Element — only
    // Elements have closest()/querySelector. Climb to a tag Element first:
    //   <div contenteditable>          ← Element / HTMLElement
    //     #text "hello"  ← node here   ← Text (Node, not Element) → use parentElement
    const element = this.isElement(node) ? node : node?.parentElement;
    const content = element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
    const blockId = content ? this.blockIdForContent(content) : undefined;
    if (!node || !content || !blockId || !root.contains(content) || !this.contains(root, content)) {
      return;
    }

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
   * Returns the BlockView row that belongs to `block` itself, not descendants.
   *
   * @param block - BlockView container that may own a `.rivto-block-row`.
   * @returns The direct row element, or `null` when a custom shell omitted it.
   */
  private ownedBlockRow(block: HTMLElement): HTMLElement | null {
    return block.querySelector(`:scope > .${BLOCK_ROW_CLASS}`);
  }

  /**
   * Finds the nested BlockView whose own row is closest to a wrapping-parent hit.
   *
   * Distances use each descendant's row box, not the full BlockView. Parent
   * BlockViews include nested children in their bounding rect, so measuring the
   * wrapper would keep selecting the same parent we are trying to skip.
   *
   * @param parent - Closest BlockView that wrapped the pointer without owning the hit.
   * @param x - Horizontal viewport coordinate from a pointer event.
   * @param y - Vertical viewport coordinate from a pointer event.
   * @returns Nearest nested BlockView, or `undefined` when none have a row.
   */
  private nearestNestedBlock(parent: HTMLElement, x: number, y: number): HTMLElement | undefined {
    const root = parent.closest<HTMLElement>(PANEL_SELECTOR);
    return [...parent.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)]
      .filter((candidate) => !root || this.contains(root, candidate))
      .map((candidate) => {
        const row = this.ownedBlockRow(candidate);
        return row
          ? { candidate, distance: this.distanceToRect(row.getBoundingClientRect(), x, y) }
          : undefined;
      })
      .filter((entry): entry is NearbyBlock => Boolean(entry))
      .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  }

  /**
   * Euclidean distance from a viewport point to the nearest point inside `rect`.
   * Zero when `(x, y)` is already inside the rectangle.
   *
   * @param rect - Element bounding box in viewport coordinates.
   * @param x - Client X (e.g. `PointerEvent.clientX`).
   * @param y - Client Y (e.g. `PointerEvent.clientY`).
   */
  private distanceToRect(rect: DOMRect, x: number, y: number): number {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
  }

  /**
   * Finds the editable content under the pointer, or the nearest one in a gap.
   *
   * @param root - EditorPanel root that scopes ownership.
   * @param x - Client X in viewport pixels.
   * @param y - Client Y in viewport pixels.
   * @returns The hit `[data-block-content]` Element, or the closest one by distance.
   */
  private contentNearPoint(root: HTMLElement, x: number, y: number): HTMLElement | undefined {
    const hit = root.ownerDocument
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
    if (hit && root.contains(hit) && this.contains(root, hit)) {
      return hit;
    }
    return this.orderedContents(root)
      .map((content) => ({
        content,
        distance: this.distanceToRect(content.getBoundingClientRect(), x, y),
      }))
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
  private nearestTextPoint(content: HTMLElement, x: number, y: number): DOMSelectionPoint {
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
  private pointAtOffset(content: HTMLElement, requestedOffset: number): DOMPoint {
    // SHOW_TEXT → only Text nodes ("hello"), skipping Element tags in between.
    const walker = content.ownerDocument.createTreeWalker(content, 4); // NodeFilter.SHOW_TEXT
    let remaining = Math.max(0, requestedOffset);
    let last: Node | undefined;
    let point: DOMPoint | undefined;
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
   * Resolves an owning block, projecting nested occurrence hits onto their enclosing block.
   *
   * @param root - Current occurrence.
   * @param element - Browser hit target.
   * @returns Owning block, or null outside this occurrence.
   */
  private getBlock(root: HTMLElement, element: Element | null): HTMLElement | null {
    if (!element || !root.contains(element)) {
      return null;
    }
    let occurrence = element.closest<HTMLElement>(PANEL_SELECTOR);
    while (occurrence && occurrence !== root) {
      element = occurrence.parentElement;
      occurrence = element?.closest<HTMLElement>(PANEL_SELECTOR) ?? null;
    }
    return occurrence === root ? (element?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null) : null;
  }

  /**
   * Finds editable content for a stable block ID.
   *
   * @param root - Current occurrence.
   * @param id - Block identity.
   * @returns Content host or undefined when absent.
   */
  private findContent(root: HTMLElement, id: string): HTMLElement | undefined {
    const blocks = root.querySelectorAll<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    for (const block of blocks) {
      if (!this.contains(root, block)) {
        continue;
      }
      const contents = block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR);
      for (const content of contents) {
        if (this.contains(root, content) && content.closest(BLOCK_ID_SELECTOR) === block) {
          return content;
        }
      }
    }
    return undefined;
  }

  /**
   * Narrows a DOM node without relying on the global window realm.
   *
   * @param node - Candidate node.
   * @returns Whether the candidate is an element.
   */
  private isElement(node: Node | null): node is Element {
    return node?.nodeType === 1;
  }

  /**
   * Checks occurrence ownership independently of DOM ancestry alone.
   *
   * @param root - Current occurrence.
   * @param element - Candidate descendant.
   * @returns Whether this occurrence owns the element.
   */
  private contains(root: HTMLElement, element: Element): boolean {
    return root.contains(element) && element.closest(PANEL_SELECTOR) === root;
  }
}
