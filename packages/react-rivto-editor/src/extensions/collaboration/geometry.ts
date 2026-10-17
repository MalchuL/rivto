import { resolveSelectionEndpoints } from "../../managers/selection/selection-endpoints";
import type { DocumentModel } from "@chulane/document-model";
import { PanelDOM, findPanelElements } from "../../managers/events/panel-dom";
import { pointAtOffset } from "../../managers/selection/editor-dom-selection";
import { decodeSelection, type Presence } from "./state";

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
  const from = pointAtOffset(content, start);
  const to = pointAtOffset(content, end);
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
 * Resolves a peer's pointer into the viewer's surface coordinates.
 *
 * @param root - Receiving panel root.
 * @param presence - Validated remote state.
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
 * Measures only the mounted entities referenced by a remote selection.
 *
 * @param root - Receiving panel root, excluding embedded document occurrences.
 * @param document - Current shared content used to resolve text anchors.
 * @param presence - Validated remote state.
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
    const selection = decodeSelection(document, presence.selection);
    for (const range of selection.blocks) {
      if (range.end === -1) {
        const block = dom.findBlock(range.id);
        if (block) {
          result.push(box(block.getBoundingClientRect(), "object"));
        }
      } else {
        const content = dom.findContent(range.id);
        if (content) {
          result.push(...textRects(content, range.start, range.end));
        }
      }
    }
    const textSelection = selection.blocks.some(
      (range) => range.end !== -1 && range.start !== range.end,
    );
    const ends = resolveSelectionEndpoints(
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
