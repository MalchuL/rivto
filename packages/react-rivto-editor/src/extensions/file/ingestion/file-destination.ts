import {
  BlockSelectionEndpoints,
  type BlockDropDestination,
  type ResolvedBlockDropTarget,
} from "@chulane/rivto-page";
import type { ReactPanelApi } from "../../../panels/types";
import type { EditorEvent } from "../../../managers/events/editor-event";
import type { FileIngestionPoint } from "./types";

/** Editor operations borrowed when validating a file destination. */
export interface FileDestinationEditor {
  /** Creates or identifies the default empty writing block. */
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "createEmptyBlock" | "isEmptyBlock"
  >;
}

/** Panel operations borrowed when capturing an inline file destination. */
export interface FileSelectionPanel {
  /** Reads the DOM and stored selection. */
  readonly selection: Pick<ReactPanelApi["selection"], "readDOM" | "get">;
  /** Looks up a selected block and its content. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlock">;
}

/** Panel operations borrowed when capturing or validating file destinations. */
export interface FileDestinationPanel extends FileSelectionPanel {
  /** Provides default writing-block operations. */
  readonly editor: FileDestinationEditor;
  /** Looks up blocks, their nodes, and their children. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    "getBlock" | "getBlockNode" | "hasChildren" | "getRootIds" | "getChildIds" | "hasBlock"
  >;
  /** Optional panel boundary used to translate document root placement. */
  readonly rootBlockId?: string;
}

/**
 * Location and original text captured before asynchronous attachment preparation.
 *
 * A block replacement carries the content used to detect intervening edits.
 * A Page drop captures its parent and, for a gap, both neighbors so preparation
 * cannot silently insert into a changed location. Insertion after a block does
 * not capture replacement state.
 */
export type FileDestination =
  | {
      /** Inserts within an existing block. */
      readonly kind: "inline";
      /** Stable ID of the block receiving the file. */
      readonly blockId: string;
      /** Inclusive start of the captured text selection. */
      readonly start: number;
      /** Exclusive end of the captured text selection. */
      readonly end: number;
      /** Original block content used to detect intervening edits. */
      readonly content: string;
    }
  | {
      /** Inserts a block without replacing an existing block. */
      readonly kind: "block";
      /** Block after which the new block is inserted, when provided. */
      readonly afterId?: string;
      /** Page block destination resolved from mounted drop regions. */
      readonly placement?: BlockDropDestination;
      /** This variant does not replace a block. */
      readonly replaceId?: never;
      /** This variant does not capture replacement content. */
      readonly content?: never;
    }
  | {
      /** Replaces an existing block with a prepared file block. */
      readonly kind: "block";
      /** Block preceding the insertion point, when provided. */
      readonly afterId?: string;
      /** Stable ID of the block to replace. */
      readonly replaceId: string;
      /** Replacement does not use a Page block destination. */
      readonly placement?: never;
      /** Original content used to detect intervening edits. */
      readonly content: string;
    }
  | {
      /** Inserts a canvas element. */
      readonly kind: "element";
      /** Horizontal insertion coordinate in canvas units. */
      readonly x: number;
      /** Vertical insertion coordinate in canvas units. */
      readonly y: number;
    };

/**
 * Returns the current single-block selection as an inline destination.
 *
 * The live DOM selection takes precedence over the panel selection. If the
 * chosen selection does not identify a single existing block, the fallback
 * block is captured at its end.
 *
 * @param reactPanel - Panel providing the current selection and blocks.
 * @param fallbackBlockId - Block used when the selection cannot provide a single destination.
 * @returns Inline destination, or undefined when neither selection nor fallback resolves.
 */
export function inlineDestination(
  reactPanel: FileSelectionPanel,
  fallbackBlockId?: string,
): FileDestination | undefined {
  const selected = selectedInlineDestination(reactPanel);
  if (selected) {
    return selected;
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
 * Captures the current selection when its endpoints belong to one existing block.
 *
 * The DOM selection takes precedence over the panel selection, and the stored
 * range is normalized so its start precedes its end.
 *
 * @param reactPanel - Panel supplying the current selection and block contents.
 * @returns The selected inline destination, or undefined for an unresolved or multi-block selection.
 */
function selectedInlineDestination(reactPanel: FileSelectionPanel): FileDestination | undefined {
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
  return undefined;
}

/** Event context needed to resolve a file destination. */
interface FileDestinationContext extends Pick<
  EditorEvent<"surface", "paste">,
  "mode" | "contentElement" | "blockId" | "root"
> {
  /** Panel used to capture selection and look up blocks. */
  readonly reactPanel: FileSelectionPanel;
}

/** Captured destination and viewport position for file paste feedback. */
export interface FilePasteDestination {
  /** Captured location for inserting the file. */
  readonly destination: FileDestination;
  /** Viewport position for upload feedback. */
  readonly point: FileIngestionPoint;
}

/**
 * Locates the feedback position for a file selected from a block's picker.
 *
 * The block's lower left corner is used when mounted; otherwise feedback starts
 * at the center of the current viewport.
 *
 * @param root - Active panel root, or null when the panel is unmounted.
 * @param blockId - Stable ID of the block that opened the picker.
 * @returns Viewport coordinates for upload feedback.
 */
export function filePickerPoint(root: HTMLElement | null, blockId: string): FileIngestionPoint {
  const block = root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  const bounds = block?.getBoundingClientRect();
  return { x: bounds?.left ?? innerWidth / 2, y: bounds?.bottom ?? innerHeight / 2 };
}

/**
 * Captures the insertion destination and status position for a paste event.
 *
 * Content pastes use the current text selection. Surface pastes use the center
 * of the receiving bounds and may update the native selection through hit testing.
 *
 * @param context - Receiving panel, surface mode, and captured DOM boundaries.
 * @returns The destination and viewport position, or undefined when text has no destination.
 */
export function filePasteDestination(
  context: FileDestinationContext,
): FilePasteDestination | undefined {
  const { reactPanel, contentElement, blockId, root } = context;
  const bounds = contentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
  const destination = contentElement
    ? inlineDestination(reactPanel, blockId)
    : fileDestinationAtPoint(context, {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
  return destination
    ? { destination, point: { x: bounds.left + bounds.width / 2, y: bounds.bottom } }
    : undefined;
}

/**
 * Verifies that a captured text destination or Page placement is still safe to use.
 *
 * @param reactPanel - Panel containing the destination block.
 * @param destination - Destination captured before asynchronous work.
 * @returns False when the original block was deleted, edited, or is no longer
 * replaceable, a Page destination is no longer within the panel, or a captured
 * gap no longer has the same neighbors.
 */
export function isFileDestinationCurrent(
  reactPanel: Pick<FileDestinationPanel, "editor" | "blocks" | "rootBlockId">,
  destination: FileDestination,
): boolean {
  if (destination.kind === "inline") {
    return reactPanel.blocks.getBlock(destination.blockId)?.content === destination.content;
  }
  if (destination.kind === "block" && destination.placement) {
    const { parentId } = destination.placement;
    const siblings = blockGapSiblings(reactPanel, parentId);
    if (!siblings) {
      return false;
    }
    if (destination.placement.kind === "inside") {
      return true;
    }
    const { previousId, nextId } = destination.placement;
    const index = nextId === null ? siblings.length : siblings.indexOf(nextId);
    return index >= 0 && (index === 0 ? null : siblings[index - 1]) === previousId;
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
 * Resolves a file drop against the same Page gaps used by block dragging.
 *
 * Text content retains caret insertion; Page drop targets create a new block
 * at the resolved parent and neighbors, which are validated after preparation.
 *
 * @param context - Receiving panel and event context.
 * @param point - Drop position in viewport pixels.
 * @returns A captured Page block placement, text, block, or canvas destination.
 * @throws If Page geometry resolution or delegated browser hit testing fails.
 */
export function fileDropDestination(
  context: EditorEvent<"surface", "drop">,
  point: FileIngestionPoint,
): FileDestination {
  const target = pageFileDropTarget(context, point);
  if (target) {
    return { kind: "block", placement: target.destination };
  }
  return fileDestinationAtPoint(context, point);
}

/**
 * Resolves the Page block target shared by file-drop preview and insertion.
 *
 * Text content is excluded because it receives an inline insertion instead.
 * The native event target avoids repeating browser hit testing after feedback
 * changes the DOM; the resolver still checks that the target is connected.
 *
 * @param context - Surface and panel captured for the current drag event.
 * @param point - Pointer position in viewport pixels.
 * @returns The Page target, or undefined for text, canvas, and unresolved points.
 * @throws If the Page resolver fails.
 */
export function pageFileDropTarget(
  context: Pick<
    EditorEvent<"surface", "drop">,
    "mode" | "contentElement" | "reactPanel" | "root" | "raw"
  >,
  point: FileIngestionPoint,
): ResolvedBlockDropTarget | undefined {
  if (context.mode !== "block" || context.contentElement) {
    return undefined;
  }
  const ElementConstructor = context.root.ownerDocument.defaultView?.Element;
  const hit =
    ElementConstructor && context.raw.target instanceof ElementConstructor
      ? context.raw.target
      : undefined;
  return context.reactPanel.page.dropTargets.resolve(point.x, point.y, undefined, hit);
}

/**
 * Captures a fresh text destination or sibling gap for a retry after changes.
 *
 * A gap keeps its following neighbor when present, otherwise its preceding
 * neighbor; an unavailable parent or both missing anchors keep the original gap.
 *
 * @param reactPanel - Panel containing the current selection and sibling lists.
 * @param destination - Destination from the failed attempt.
 * @returns A refreshed destination when possible, or the original destination.
 */
export function retryFileDestination(
  reactPanel: FileDestinationPanel,
  destination: FileDestination,
): FileDestination {
  if (destination.kind === "block" && destination.placement?.kind === "between") {
    const gap = destination.placement;
    const siblings = blockGapSiblings(reactPanel, gap.parentId);
    if (!siblings) {
      return destination;
    }
    let index = gap.nextId === null ? siblings.length : siblings.indexOf(gap.nextId);
    if (index < 0 && gap.previousId !== null) {
      const previousIndex = siblings.indexOf(gap.previousId);
      index = previousIndex < 0 ? -1 : previousIndex + 1;
    } else if (index < 0 && gap.previousId === null) {
      index = 0;
    }
    if (index < 0) {
      return destination;
    }
    return {
      kind: "block",
      placement: {
        ...gap,
        previousId: siblings[index - 1] ?? null,
        nextId: siblings[index] ?? null,
      },
    };
  }
  let blockId: string | undefined;
  if (destination.kind === "inline") {
    blockId = destination.blockId;
  } else if (destination.kind === "block") {
    blockId = destination.replaceId;
  }
  return blockId ? (inlineDestination(reactPanel, blockId) ?? destination) : destination;
}

/**
 * Reads current siblings for a gap inside the panel boundary.
 *
 * @param panel - Panel providing boundary-scoped block reads.
 * @param parentId - Canonical parent, or null for document roots.
 * @returns Ordered sibling IDs, or undefined when the parent is outside the panel.
 */
function blockGapSiblings(
  panel: Pick<FileDestinationPanel, "blocks" | "rootBlockId">,
  parentId: string | null,
): readonly string[] | undefined {
  if (parentId === null && panel.rootBlockId !== undefined) {
    return undefined;
  }
  if (parentId !== null && parentId !== panel.rootBlockId && !panel.blocks.hasBlock(parentId)) {
    return undefined;
  }
  return parentId === null || !panel.blocks.hasBlock(parentId)
    ? panel.blocks.getRootIds()
    : panel.blocks.getChildIds(parentId);
}

/**
 * Chooses inline, block, or canvas placement for one browser point.
 *
 * Text hit testing updates the native selection before capturing the destination.
 * Canvas coordinates account for the surface pan and zoom.
 *
 * @param context - Receiving panel, surface mode, and captured DOM boundaries.
 * @param context.reactPanel - Panel supplying the selection and block contents.
 * @param context.mode - Current editor mode.
 * @param context.contentElement - Editable content under the event, when present.
 * @param context.blockId - Block under the event, when present.
 * @param context.root - Active surface root.
 * @param point - Viewport coordinates to inspect.
 * @param point.x - Viewport x coordinate.
 * @param point.y - Viewport y coordinate.
 * @returns Captured insertion destination.
 */
export function fileDestinationAtPoint(
  context: FileDestinationContext,
  point: FileIngestionPoint,
): FileDestination {
  const { reactPanel, mode, contentElement, blockId, root } = context;
  const { x: clientX, y: clientY } = point;
  if (contentElement) {
    placeCaretAtPoint(root.ownerDocument, point);
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

/**
 * Resolves a collapsed caret range at a browser hit-test position.
 *
 * The standard caret API is preferred; the legacy range API is used when it
 * cannot resolve the point. This does not modify the current selection.
 *
 * @param ownerDocument - Document containing the receiving editor surface.
 * @param point - Viewport coordinates to hit-test.
 * @returns A collapsed range, or undefined when neither browser API resolves the point.
 * @throws If the browser returns an invalid caret position or range creation fails.
 */
export function fileCaretRangeAtPoint(
  ownerDocument: Document,
  point: FileIngestionPoint,
): Range | undefined {
  const document = ownerDocument as Document & {
    /**
     * Resolves a legacy browser caret range from viewport coordinates.
     *
     * @param x - Viewport horizontal coordinate in CSS pixels.
     * @param y - Viewport vertical coordinate in CSS pixels.
     * @returns A range at the point, or null when the browser cannot resolve one.
     */
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const hit = document.caretPositionFromPoint?.(point.x, point.y);
  if (hit) {
    const range = ownerDocument.createRange();
    range.setStart(hit.offsetNode, hit.offset);
    range.collapse(true);
    return range;
  }
  return document.caretRangeFromPoint?.(point.x, point.y) ?? undefined;
}

/**
 * Places the native selection at the shared browser hit-test position.
 *
 * @param ownerDocument - Document containing the receiving editor surface.
 * @param point - Viewport coordinates to hit-test.
 * @returns Updates the selection when a caret position can be resolved.
 */
function placeCaretAtPoint(ownerDocument: Document, point: FileIngestionPoint): void {
  const range = fileCaretRangeAtPoint(ownerDocument, point);
  if (range) {
    ownerDocument
      .getSelection()
      ?.setBaseAndExtent(
        range.startContainer,
        range.startOffset,
        range.startContainer,
        range.startOffset,
      );
  }
}
