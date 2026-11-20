import { BlockSelectionEndpoints } from "./block-selection-endpoints";
import type { BlockVirtualizationRegistry } from "../virtualization/block-virtualization-registry";
import type { BlockEditorSelection } from "../../adapter/types";
import type { InputRoot } from "@chulane/rivto-root";
import type {
  BlockSelectionPosition as EditorPosition,
  BlockSelectionSnapshot as Selection,
  BlockSelectionAttachment,
  BlockSelectionHitTest,
  BlockBrowserSelectionApi,
  BlockCaretFocusResult,
  BlockAdjacentCaretMount,
} from "./types";
import { BlockSelectionRanges } from "./block-selection-ranges";
import { BlockTextSelectionGesture } from "./block-text-selection-gesture";
import type { BlockTextSelectionGestureApi } from "./types";
const BLOCK_CONTENT_SELECTOR = "[data-block-content]";
const BLOCK_ID_SELECTOR = "[data-block-id]";
const BLOCK_ID_ATTRIBUTE = "data-block-id";
const PANEL_SELECTOR = "[data-rivto-block-editor]";
/**
 * Browser ↔ editor selection bridge for Rivto's multi-contenteditable surfaces.
 *
 * ## DOM vocabulary used inside Root's browser implementation
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
 * Quick map for the browser implementation behind the borrowed Root:
 *
 * | Type         | Meaning                         | Example              | Has closest()? |
 * |--------------|---------------------------------|----------------------|----------------|
 * | Node         | Any tree piece                  | Text, Element, …    | no (not always)|
 * | Element      | A tag node                      | `<div>`, `<svg>`     | yes            |
 * | HTMLElement  | An HTML tag                     | block / block content  | yes + HTML APIs|
 * | Text         | Character content (a Node)      | `"hello"`            | no             |
 *
 * Within Root's browser implementation:
 * - `node: Node` → caret target (usually Text; sometimes the content Element).
 * - `content` / `root: HTMLElement` → HTML hosts we query with selectors /
 *   `closest()` / `focus()`.
 *
 * Typical Rivto tree, represented here only by Root capabilities and block IDs:
 *
 * ```text
 * HTMLElement (editor root)
 * └── HTMLElement (block host, data-block-id)
 *     └── HTMLElement (block content, contenteditable)
 *         └── Text ("hello")   ← Selection often points here
 * ```
 */

/** Maps Root-normalized browser selection to host-owned portable block selection. */
export class BlockDOMSelection implements BlockBrowserSelectionApi {
  private attachment: BlockSelectionAttachment | undefined;

  /**
   * Binds DOM conversion to host-owned ordering and text lengths.
   *
   * @param selection - Borrowed selection data capability.
   * @param virtualization - Editor-owned lookup for mounted windowing views.
   */
  constructor(
    private readonly selection: Pick<
      BlockEditorSelection,
      "getSelectableBlockIds" | "getTextLength"
    >,
    private readonly virtualization: Pick<BlockVirtualizationRegistry, "get">,
  ) {}

  /**
   * Binds browser selection reads and restoration to one mounted editor occurrence.
   *
   * A disposer releases only the attachment it created, including after remount.
   * Selection data remains owned by the host and is not changed by attachment.
   *
   * @param hitTest - Borrowed structural hit testing for this mounted occurrence.
   * @param occurrence - Borrowed Root capability; detachment invalidates selection operations.
   * @returns Idempotent disposer detaching this occurrence.
   * @throws If another occurrence is already attached.
   */
  attach(
    hitTest: BlockSelectionHitTest,
    occurrence: Pick<
      InputRoot,
      | "isAttached"
      | "clearSelection"
      | "focus"
      | "focusTextHost"
      | "readTextSelection"
      | "readTextLength"
      | "restoreTextSelection"
      | "createTextSelectionGesture"
      | "adjacentTextPosition"
      | "verticalTextPosition"
      | "scrollFirstMatchingRegionIntoView"
      | "hasRegionByAttribute"
    >,
  ): () => void {
    if (this.attachment) {
      throw new Error("Browser selection already attached");
    }
    const attachment = { hitTest, occurrence };
    this.attachment = attachment;
    return () => {
      if (this.attachment === attachment) {
        this.attachment = undefined;
      }
    };
  }

  /**
   * Creates a gesture bound to the exact current selection attachment.
   *
   * @returns A browser-free gesture, or undefined while the occurrence is detached.
   */
  createTextSelectionGesture(): BlockTextSelectionGestureApi | undefined {
    const attachment = this.activeAttachment();
    return attachment
      ? new BlockTextSelectionGesture(
          attachment.occurrence.createTextSelectionGesture(
            {
              ownerSelector: BLOCK_ID_SELECTOR,
              ownerAttribute: BLOCK_ID_ATTRIBUTE,
              contentSelector: BLOCK_CONTENT_SELECTOR,
              boundarySelector: PANEL_SELECTOR,
            },
            (id) => this.virtualization.get(attachment.occurrence)?.mountBlocks([id]),
            () => this.activeAttachment() === attachment,
          ),
        )
      : undefined;
  }

  /**
   * Finds the owning block under viewport coordinates in the attached occurrence.
   *
   * A hit is discarded if its originating attachment ends during browser lookup.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Block identity, or undefined when detached or no owned block is hit.
   * @throws Propagates browser hit testing, layout, and attachment-check failures.
   */
  blockIdAtPoint(x: number, y: number): string | undefined {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return undefined;
    }
    const id = attachment.hitTest.readBlockIdAtPoint(x, y);
    return this.activeAttachment() === attachment ? id : undefined;
  }

  /**
   * Checks whether active virtualization has unmounted a selection endpoint.
   *
   * Matching blocks inside nested editor occurrences do not satisfy an endpoint
   * of this occurrence. A replacement during lookup discards the result.
   *
   * @param selection - Current directed selection whose endpoints must be retained.
   * @returns True when a virtualized occurrence is missing an endpoint; false while detached.
   * @throws Propagates selector evaluation or occurrence ownership failures.
   */
  hasVirtualizedMissingEndpoints(selection: Selection): boolean {
    const attachment = this.activeAttachment();
    const missing = Boolean(
      attachment &&
      this.virtualization.get(attachment.occurrence) &&
      [selection.anchorBlockId, selection.focusBlockId].some(
        (id) =>
          id && !attachment.occurrence.hasRegionByAttribute(BLOCK_ID_ATTRIBUTE, id, PANEL_SELECTOR),
      ),
    );
    return missing && this.activeAttachment() === attachment;
  }

  /**
   * Reads `window.getSelection()` when both endpoints belong to this editor root.
   *
   * Anchor and focus are read independently instead of using Range start/end.
   * A Range normalizes endpoints into document order and would lose the
   * direction of a bottom-to-top selection.
   *
   * @returns Directed selection, or `undefined` when detached or there is no usable
   *   browser selection inside this editor.
   */
  readEditorDOMSelection(): Selection | undefined {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return;
    }
    const selection = attachment.occurrence.readTextSelection({
      ownerSelector: BLOCK_ID_SELECTOR,
      ownerAttribute: BLOCK_ID_ATTRIBUTE,
      contentSelector: BLOCK_CONTENT_SELECTOR,
      boundarySelector: PANEL_SELECTOR,
    });
    if (!selection) {
      return;
    }
    const anchor = { blockId: selection.anchor.ownerId, offset: selection.anchor.offset };
    const head = { blockId: selection.focus.ownerId, offset: selection.focus.offset };
    const result = BlockSelectionRanges.createFromPositions(this.selection, anchor, head);
    return this.activeAttachment() === attachment ? result : undefined;
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
   * @param selection - Editor selection captured before the structural command.
   *
   * @returns True when a text selection was resolved and restored; false when detached.
   */
  restoreEditorDOMSelection(selection: Selection): boolean {
    const attachment = this.activeAttachment();
    if (!attachment || BlockSelectionRanges.isStructuralSelection(selection)) {
      return false;
    }
    const query = {
      ownerSelector: BLOCK_ID_SELECTOR,
      ownerAttribute: BLOCK_ID_ATTRIBUTE,
      contentSelector: BLOCK_CONTENT_SELECTOR,
      boundarySelector: PANEL_SELECTOR,
    };
    const ends = BlockSelectionEndpoints.resolve(
      selection,
      (ownerValue) => attachment.occurrence.readTextLength({ ...query, ownerValue }) ?? 0,
    );
    if (!ends || this.activeAttachment() !== attachment) {
      return false;
    }
    return attachment.occurrence.restoreTextSelection(
      query,
      {
        anchor: { ownerId: ends.anchor.blockId, offset: ends.anchor.offset },
        focus: { ownerId: ends.head.blockId, offset: ends.head.offset },
      },
      (id) => this.virtualization.get(attachment.occurrence)?.mountBlocks([id]),
      () => this.activeAttachment() === attachment,
    );
  }
  /**
   * Requests focus and places a collapsed browser caret in an occurrence-owned block.
   *
   * Only the first matching block shell in this occurrence is considered. A
   * contentless shell is distinct from an unmounted block so the host can mount
   * only when necessary. This does not mutate model selection or mount content.
   *
   * @param position - Block identity and requested flat UTF-16 caret offset.
   * @returns Focus was requested when a content host exists, or the shell, content, or attachment is missing.
   * @throws Propagates browser focus and range failures.
   */
  focusBlock(position: EditorPosition): BlockCaretFocusResult {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return "detached";
    }
    const result = attachment.occurrence.focusTextHost(
      {
        ownerSelector: BLOCK_ID_SELECTOR,
        ownerAttribute: BLOCK_ID_ATTRIBUTE,
        ownerValue: position.blockId,
        contentSelector: BLOCK_CONTENT_SELECTOR,
        boundarySelector: PANEL_SELECTOR,
      },
      position.offset,
      () => this.activeAttachment() === attachment,
    );
    if (result === "owner-missing") {
      return "unmounted";
    }
    if (result === "content-missing") {
      return "no-content";
    }
    return result === "focused" ? "focus-requested" : "detached";
  }

  /**
   * Focuses the attached occurrence and reveals a structurally selected block.
   *
   * This clears the native text range without changing model selection. Missing
   * blocks still leave the occurrence focused, matching structural navigation.
   *
   * @param blockId - Identity of the block to reveal.
   * @returns Whether an occurrence was attached and focus was requested.
   * @throws Propagates browser focus, selection, and scrolling failures.
   */
  focusBlockSelection(blockId: string): boolean {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return false;
    }
    attachment.occurrence.clearSelection();
    if (this.activeAttachment() !== attachment) {
      return false;
    }
    attachment.occurrence.focus();
    if (this.activeAttachment() !== attachment) {
      return false;
    }
    attachment.occurrence.scrollFirstMatchingRegionIntoView(
      BLOCK_ID_ATTRIBUTE,
      blockId,
      PANEL_SELECTOR,
    );
    return true;
  }

  /**
   * Resolves the immediately adjacent editable block within a host-defined scope.
   *
   * A contentless block stops the move. Only a whole-occurrence boundary may
   * ask the host to mount an offscreen neighbor; a nested scope stays bounded.
   *
   * @param blockId - Current rendered block identity.
   * @param direction - Previous or next rendered block.
   * @param scopeSelector - Selector identifying an optional local boundary.
   * @param mountAdjacent - Host operation for mounting neighboring blocks.
   * @returns Neighboring caret position, or undefined when detached, blocked, or at an edge.
   * @throws Propagates invalid selectors and browser or host mounting failures.
   */
  adjacentCaretPosition(
    blockId: string,
    direction: "left" | "right",
    scopeSelector: string,
    mountAdjacent: BlockAdjacentCaretMount,
  ): EditorPosition | undefined {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return;
    }
    const result = attachment.occurrence.adjacentTextPosition(
      {
        ownerSelector: BLOCK_ID_SELECTOR,
        ownerAttribute: BLOCK_ID_ATTRIBUTE,
        contentSelector: BLOCK_CONTENT_SELECTOR,
        boundarySelector: PANEL_SELECTOR,
      },
      blockId,
      direction,
      scopeSelector,
      mountAdjacent,
      () => this.activeAttachment() === attachment,
    );
    return result ? { blockId: result.ownerId, offset: result.offset } : undefined;
  }

  /**
   * Resolves vertical caret movement without exposing the measured content hosts.
   *
   * The host may mount adjacent blocks when movement leaves the current block
   * at a rendered edge. A remount during that callback invalidates its result.
   * Soft wrapping does not exist in the block's stored string, so DOM geometry
   * determines the visual line. The scan measures every character offset;
   * repeated text-node walks and line lookups also depend on markup and wrapping.
   * Page blocks are intentionally short, and a cached layout index can replace
   * the scan later if profiling shows long code blocks need one.
   *
   * @param position - Current block identity and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @param mountAdjacent - Host capability for mounting neighboring blocks.
   * @returns Nearest visual-line position, or undefined when detached or unresolved.
   * @throws Propagates browser measurement and host lookup or mounting failures.
   */
  verticalCaretPosition(
    position: EditorPosition,
    direction: "up" | "down",
    mountAdjacent: BlockAdjacentCaretMount,
  ): EditorPosition | undefined {
    const attachment = this.activeAttachment();
    if (!attachment) {
      return;
    }
    const result = attachment.occurrence.verticalTextPosition(
      {
        ownerSelector: BLOCK_ID_SELECTOR,
        ownerAttribute: BLOCK_ID_ATTRIBUTE,
        contentSelector: BLOCK_CONTENT_SELECTOR,
        boundarySelector: PANEL_SELECTOR,
      },
      { ownerId: position.blockId, offset: position.offset },
      direction,
      mountAdjacent,
      () => this.activeAttachment() === attachment,
    );
    return result ? { blockId: result.ownerId, offset: result.offset } : undefined;
  }
  /**
   * Resolves the current selection attachment only while its borrowed Root remains active.
   *
   * @returns Current attachment, or undefined after either owner detaches.
   * @throws Propagates the occurrence owner check's failure.
   */
  private activeAttachment(): BlockSelectionAttachment | undefined {
    const attachment = this.attachment;
    return attachment?.occurrence.isAttached() && this.attachment === attachment
      ? attachment
      : undefined;
  }
}
