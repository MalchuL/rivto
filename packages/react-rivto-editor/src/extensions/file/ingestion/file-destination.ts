import type { EditorMode } from "@chulane/rivto";
import { BlockSelectionEndpoints } from "@chulane/rivto-page";
import type { ReactPanelApi } from "../../../panels/types";

/** Location and original text captured before asynchronous attachment preparation. */
export type FileDestination =
  | {
      readonly kind: "inline";
      readonly blockId: string;
      readonly start: number;
      readonly end: number;
      readonly content: string;
    }
  | {
      readonly kind: "block";
      readonly afterId?: string;
      readonly replaceId?: string;
      readonly content?: string;
    }
  | { readonly kind: "element"; readonly x: number; readonly y: number };

/**
 * Returns the current single-block selection as an inline destination.
 * @param reactPanel - Panel providing the current selection and blocks.
 * @param fallbackBlockId - Block used when no live DOM selection exists.
 * @returns Inline destination, when one block can own the insertion.
 */
export function inlineDestination(
  reactPanel: ReactPanelApi,
  fallbackBlockId?: string,
): FileDestination | undefined {
  const selection = reactPanel.selection.readDOM() ?? reactPanel.selection.get();
  const endpoints =
    selection &&
    BlockSelectionEndpoints.resolve(
      selection,
      (id) => reactPanel.blocks.getBlock(id)?.content.length ?? 0,
    );
  const selectedBlock = endpoints && reactPanel.blocks.getBlock(endpoints.anchor.blockId);
  if (endpoints && selectedBlock && endpoints.anchor.blockId === endpoints.head.blockId) {
    return {
      kind: "inline",
      blockId: endpoints.anchor.blockId,
      content: selectedBlock.content,
      start: Math.min(endpoints.anchor.offset, endpoints.head.offset),
      end: Math.max(endpoints.anchor.offset, endpoints.head.offset),
    };
  }
  const block = fallbackBlockId ? reactPanel.blocks.getBlock(fallbackBlockId) : undefined;
  return block
    ? {
        kind: "inline",
        blockId: block.id,
        content: block.content,
        start: block.content.length,
        end: block.content.length,
      }
    : undefined;
}

/**
 * Verifies that a captured text destination is still safe to replace.
 *
 * @param reactPanel - Panel containing the destination block.
 * @param destination - Destination captured before asynchronous work.
 * @returns False when the original block was deleted, edited, or is no longer replaceable.
 */
export function isFileDestinationCurrent(
  reactPanel: ReactPanelApi,
  destination: FileDestination,
): boolean {
  if (destination.kind === "inline") {
    return reactPanel.blocks.getBlock(destination.blockId)?.content === destination.content;
  }
  if (destination.kind !== "block" || !destination.replaceId) {
    return true;
  }
  const block = reactPanel.blocks.getBlockNode(destination.replaceId);
  const factory = reactPanel.editor.defaultWritingBlockFactory;
  return Boolean(
    block &&
    block.content === destination.content &&
    block.type === factory.createEmptyBlock().type &&
    !reactPanel.blocks.hasChildren(block.id) &&
    factory.isEmptyBlock(block),
  );
}

/**
 * Captures a fresh text destination for a retry after the original block changed.
 *
 * @param reactPanel - Panel containing the current selection.
 * @param destination - Destination from the failed attempt.
 * @returns A current inline destination or the original non-text destination.
 */
export function retryFileDestination(
  reactPanel: ReactPanelApi,
  destination: FileDestination,
): FileDestination {
  let blockId: string | undefined;
  if (destination.kind === "inline") {
    blockId = destination.blockId;
  } else if (destination.kind === "block") {
    blockId = destination.replaceId;
  }
  return blockId ? (inlineDestination(reactPanel, blockId) ?? destination) : destination;
}

/**
 * Chooses inline, block, or canvas placement for one browser point.
 *
 * Text hit testing updates the native selection before capturing the destination.
 * Canvas coordinates account for the surface pan and zoom.
 *
 * @param reactPanel - Panel supplying the destination and document commands.
 * @param mode - Current editor mode.
 * @param contentElement - Editable content under the event.
 * @param blockId - Block under the event.
 * @param clientX - Viewport x coordinate.
 * @param clientY - Viewport y coordinate.
 * @param root - Active surface root.
 * @returns Captured insertion destination.
 */
export function fileDestinationAtPoint(
  reactPanel: ReactPanelApi,
  mode: EditorMode,
  contentElement: HTMLElement | null,
  blockId: string | undefined,
  clientX: number,
  clientY: number,
  root: HTMLElement,
): FileDestination {
  if (contentElement) {
    const document = root.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const hit = document.caretPositionFromPoint?.(clientX, clientY);
    const range = document.caretRangeFromPoint?.(clientX, clientY);
    const node = hit?.offsetNode ?? range?.startContainer;
    const offset = hit?.offset ?? range?.startOffset;
    if (node !== undefined && offset !== undefined) {
      root.ownerDocument.getSelection()?.setBaseAndExtent(node, offset, node, offset);
    }
    const inline = inlineDestination(reactPanel, blockId);
    if (inline) {
      return inline;
    }
  }
  if (mode === "block") {
    return { kind: "block", afterId: blockId };
  }
  const bounds = root.getBoundingClientRect();
  const zoom = Number(root.dataset.edgelessZoom) || 1;
  return {
    kind: "element",
    x: (clientX - bounds.left - (Number(root.dataset.edgelessPanX) || 0)) / zoom,
    y: (clientY - bounds.top - (Number(root.dataset.edgelessPanY) || 0)) / zoom,
  };
}
