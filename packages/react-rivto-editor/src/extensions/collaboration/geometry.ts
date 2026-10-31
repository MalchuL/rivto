import { BlockDOMSelection, BlockSelectionEndpoints } from "@chulane/rivto-page";
import type { DocumentModel } from "@chulane/document-model";
import { PanelDOM, findPanelElements, isInPanel } from "../../panels/panel-dom";
import { BLOCK_ID_SELECTOR } from "../../constants";
import type { CollaborationParticipantState as Presence } from "@chulane/rivto";

/** Attribute owned exclusively by the collaboration renderer on raw text hosts. */
export const COLLABORATION_TEXT_ATTRIBUTE = "data-collaboration-text";
/** One screen-space decoration before translation into the clipped panel overlay. */
export interface PresenceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "caret" | "selection" | "object" | "pointer";
}

/**
 * Converts a browser rectangle into a non-interactive presence decoration.
 *
 * @param rect - Screen-space geometry of visible content.
 * @param kind - Decoration's visual purpose.
 * @returns Detached screen-space rectangle.
 */
function box(rect: DOMRect, kind: PresenceRect["kind"]): PresenceRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, kind };
}

/**
 * Measures a raw-text range without mounting virtualized content or changing selection.
 *
 * @param content - Already mounted raw text host.
 * @param start - Inclusive UTF-16 boundary.
 * @param end - Exclusive UTF-16 boundary; equal boundaries describe a caret.
 * @returns Screen rectangles, including an empty-line caret fallback.
 */
function textRects(content: HTMLElement, start: number, end: number): PresenceRect[] {
  const from = BlockDOMSelection.pointAtOffset(content, start);
  const to = BlockDOMSelection.pointAtOffset(content, end);
  const range = content.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const kind = start === end ? "caret" : "selection";
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
  if (rects.length) {
    return rects.map((rect) => box(rect, kind));
  }
  if (start === end && !content.textContent) {
    const rect = content.getBoundingClientRect();
    return [{ ...box(rect, "caret"), width: 2 }];
  }
  return [];
}

/**
 * Resolves a participant's pointer into the viewer's surface coordinates.
 *
 * @param root - Receiving panel root.
 * @param presence - Validated local-agent or remote participant state.
 * @returns Screen-space pointer, or undefined for another mode or missing content.
 */
function pointerRect(root: HTMLElement, presence: Presence): PresenceRect | undefined {
  const pointer = presence.pointer;
  if (!pointer || root.dataset.rivtoSurface !== presence.mode) {
    return undefined;
  }
  if (pointer.type === "block") {
    const block = new PanelDOM(root).findBlock(pointer.blockId);
    if (!block) {
      return undefined;
    }
    const rect = block.getBoundingClientRect();
    return {
      x: rect.left + pointer.x * rect.width,
      y: rect.top + pointer.y * rect.height,
      width: 12,
      height: 18,
      kind: "pointer",
    };
  }
  const rect = root.getBoundingClientRect();
  if (pointer.type === "panel") {
    return {
      x: rect.left + pointer.x - root.scrollLeft,
      y: rect.top + pointer.y - root.scrollTop,
      width: 12,
      height: 18,
      kind: "pointer",
    };
  }
  const zoom = Number(root.dataset.edgelessZoom) || 1;
  return {
    x: rect.left + (Number(root.dataset.edgelessPanX) || 0) + pointer.x * zoom,
    y: rect.top + (Number(root.dataset.edgelessPanY) || 0) + pointer.y * zoom,
    width: 12,
    height: 18,
    kind: "pointer",
  };
}

/**
 * Checks whether two selected shells are consecutive in one rendered document region.
 *
 * Stops at the first block, including an unselected descendant. Embedded panel
 * contents and separate canvas cards never bridge a selection decoration.
 *
 * @param dom - Receiving panel's DOM boundary.
 * @param previous - Earlier selected shell in DOM order.
 * @param next - Candidate shell to join to the previous decoration.
 * @returns Whether no intervening block, body slot, or canvas-card boundary separates them.
 */
function adjacentBlocks(dom: PanelDOM, previous: HTMLElement, next: HTMLElement): boolean {
  if (
    dom.getBody(previous) ||
    previous.closest("[data-edgeless-object-id]") !== next.closest("[data-edgeless-object-id]")
  ) {
    return false;
  }
  const walker = dom.root.ownerDocument.createTreeWalker(dom.root, NodeFilter.SHOW_ELEMENT, {
    /**
     * Includes block shells while pruning nested document occurrences.
     *
     * @param node - Element visited within the receiving panel.
     * @returns Accept for shells, skip for wrappers, or reject for another panel.
     */
    acceptNode(node) {
      const element = node as Element;
      if (!isInPanel(dom.root, element)) {
        return NodeFilter.FILTER_REJECT;
      }
      return element.matches(BLOCK_ID_SELECTOR) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  walker.currentNode = previous;
  return walker.nextNode() === next;
}

/**
 * Joins a selected parent's consecutive selected descendants without enclosing unselected rows.
 *
 * Only mounted selected blocks are measured. Side-by-side or overlapping rows
 * retain separate outlines, as do rows separated by an unselected block. Each
 * group starts at a selected ancestor; sibling or unrelated roots remain separate.
 *
 * @param dom - Receiving panel's DOM boundary.
 * @param ids - Fully selected block IDs; input order does not affect grouping.
 * @returns Viewport rectangles for consecutive vertical groups within selected subtrees.
 */
function blockRects(dom: PanelDOM, ids: string[]): PresenceRect[] {
  const blocks = ids.map((id) => dom.findBlock(id)).filter((block) => block !== null);
  blocks.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1));
  const result: PresenceRect[] = [];
  let previous: HTMLElement | undefined;
  let groupRoot: HTMLElement | undefined;
  for (const block of blocks) {
    // The recursive shell includes descendants that this participant may not have selected.
    const target = dom.getRow(block) ?? block;
    const rect = box(target.getBoundingClientRect(), "object");
    const group = result.at(-1);
    if (
      previous &&
      group &&
      groupRoot?.contains(block) &&
      rect.height > 0 &&
      group.height > 0 &&
      rect.y >= group.y + group.height - 1 &&
      rect.x < group.x + group.width &&
      rect.x + rect.width > group.x &&
      adjacentBlocks(dom, previous, block)
    ) {
      const right = Math.max(group.x + group.width, rect.x + rect.width);
      group.x = Math.min(group.x, rect.x);
      group.width = right - group.x;
      group.height = rect.y + rect.height - group.y;
    } else {
      result.push(rect);
      // Adjacency alone must not join independent blocks or sibling subtrees.
      groupRoot = block;
    }
    previous = block;
  }
  return result;
}

/**
 * Measures only the mounted entities referenced by a participant selection.
 *
 * @param root - Receiving panel root, excluding embedded document occurrences.
 * @param document - Current shared content used to resolve text anchors.
 * @param presence - Validated local-agent or remote participant state.
 * @returns Decorations in viewport coordinates; unavailable targets are omitted.
 */
export function measurePresence(
  root: HTMLElement,
  document: DocumentModel,
  presence: Presence,
): PresenceRect[] {
  const dom = new PanelDOM(root);
  const result: PresenceRect[] = [];
  if (presence.selection) {
    const selection = presence.selection;
    result.push(
      ...blockRects(
        dom,
        selection.blocks.filter((range) => range.end === -1).map((range) => range.id),
      ),
    );
    for (const range of selection.blocks) {
      if (range.end !== -1) {
        const content = dom.findContent(range.id);
        if (content) {
          result.push(...textRects(content, range.start, range.end));
        }
      }
    }
    const textSelection = selection.blocks.some(
      (range) => range.end !== -1 && range.start !== range.end,
    );
    const ends = BlockSelectionEndpoints.resolve(
      selection,
      (id) => document.blocks.getBlockNode(id)?.content.length ?? 0,
    );
    if (textSelection && ends) {
      const content = dom.findContent(ends.head.blockId);
      if (content) {
        result.push(...textRects(content, ends.head.offset, ends.head.offset));
      }
    }
    if (root.dataset.rivtoSurface === "edgeless") {
      for (const id of selection.elements ?? []) {
        const element = findPanelElements(root, `[data-edgeless-object-id="${CSS.escape(id)}"]`)[0];
        if (element) {
          result.push(box(element.getBoundingClientRect(), "object"));
        }
      }
    }
  }
  const pointer = pointerRect(root, presence);
  if (pointer) {
    result.push(pointer);
  }
  return result;
}
