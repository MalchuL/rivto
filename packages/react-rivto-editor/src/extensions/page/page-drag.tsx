/**
 * dnd-kit integration for atomic movement of one block subtree or an eligible
 * sibling-root selection. Surface rendering enters through wrapper slots, so
 * this module owns gesture mechanics without owning recursive traversal.
 *
 * @module
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import type { EditorBlock as Block } from "@chulane/rivto";
import { createStructuralSelection } from "@chulane/rivto";
import {
  BlockElementRefProvider,
  type BlockWrapperProps,
} from "../../blocks";
import { useEditor, useEditorRoot, useReactEditor } from "../../hooks";
import type { BlockSlotProps } from "../../managers";
import {
  useCallback,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { resolveAfterDropPlacement } from "./page-drag-placement";
import { selectedMoveRoots, type SelectedMoveRoots } from "./page-selection-utils";
import {
  crossDocumentBlockTransfer,
  type CrossDocumentBlockTransferPlacement,
} from "../clipboard/cross-document-block-transfer";

/** Maximum number of block rows rendered inside the floating preview. */
const MAX_PREVIEW_BLOCKS = 4;

/** Visual nesting used by `.page-block-children` in the demo stylesheet. */
const PAGE_INDENT = 24;
const EDGELESS_CARD_CONTENT_SELECTOR = "[data-edgeless-card-content]";
const CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE = "data-rivto-cross-document-page-root";
const CROSS_DOCUMENT_PAGE_ROOT_SELECTOR = `[${CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE}]`;
const PAGE_DRAG_HANDLE_CLASS = "page-drag-handle";
const PAGE_DROP_LINE_CLASS = "page-drop-line";
const PAGE_BLOCK_ROW_CLASS = "page-block-row";
const PAGE_BLOCK_SELECTOR = "[data-block-id]";
const PAGE_DRAG_SURFACE_ID = "rivto-page-drag-surface";

/**
 * Normalized document destination and visual feedback for the current pointer.
 *
 * Keeping the document target separate from the indicator owner is important:
 * horizontal gap movement can target an ancestor level while the line remains
 * visually attached to the row immediately above the pointer.
 */
interface DropPlacement {
  /** Block used by the document move operation. */
  readonly targetId: string;
  /** Relationship passed to `editor.moveBlocks`. */
  readonly position: "before" | "after" | "inside";
  /** Hovered row that owns the visible insertion line. */
  readonly indicatorId: string;
  /** Missing for a block-body highlight; present for a gap insertion line. */
  readonly indicatorEdge?: "before" | "after";
  /** Horizontal line offset relative to the hovered row. */
  readonly indicatorOffset: number;
  readonly indicatorAxis?: "horizontal";
}

interface CrossDocumentPageRootController {
  editor: ReturnType<typeof useEditor>;
  root: HTMLElement;
  setPlacement: (placement: DropPlacement | null, empty?: boolean) => void;
  resolvePlacement: (x: number, y: number) => CrossDocumentBlockTransferPlacement & {
    readonly indicator: DropPlacement | null;
  } | null;
}

/** Mounted page surfaces in this JavaScript realm; weak keys avoid retaining DOM. */
const crossDocumentPageRootControllers = new WeakMap<HTMLElement, CrossDocumentPageRootController>();

interface PointerCoordinates {
  readonly x: number;
  readonly y: number;
}

/**
 * Keeps dnd-kit auto-scroll off canvas cards. Their overflow-x is clip/hidden
 * so they are not a real horizontal scroller, but the library still writes
 * scrollLeft and shoves the whole element during Kanban drags.
 *
 * @param element - Ancestor dnd-kit is considering as an auto-scroll target.
 * @returns True for eligible scrollers inside the active modal, or normal page scrollers.
 */
function canPageDragAutoScroll(element: Element): boolean {
  // The top layer makes background ancestors inert, but dnd-kit still discovers
  // them through the DOM tree. Only the modal and its descendants may scroll.
  const modal = element.ownerDocument.querySelector("dialog:modal");
  return (!modal || modal.contains(element))
    && !(element instanceof HTMLElement && element.matches(EDGELESS_CARD_CONTENT_SELECTOR));
}

function eventPointer(event: DragMoveEvent): PointerCoordinates | null {
  const activator = event.activatorEvent as Event & { clientX?: unknown; clientY?: unknown };
  if (typeof activator.clientX !== "number" || typeof activator.clientY !== "number") return null;
  return { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y };
}

function findCrossDocumentPageController(
  sourceRoot: HTMLElement | null,
  pointer: PointerCoordinates,
): CrossDocumentPageRootController | null {
  const document = sourceRoot?.ownerDocument;
  const pageRoot = document?.elementsFromPoint(pointer.x, pointer.y)
    .map((element) => element.closest<HTMLElement>(CROSS_DOCUMENT_PAGE_ROOT_SELECTOR))
    .find((element): element is HTMLElement => Boolean(element && element !== sourceRoot));
  return pageRoot ? crossDocumentPageRootControllers.get(pageRoot) ?? null : null;
}

/** Drag state shared with recursively rendered page blocks. */
interface PageDragState {
  /** Focused gesture store that wakes only moved and indicator rows. */
  readonly placements: DropPlacementStore;
}

/** Per-row external store for drag placement feedback. */
interface DropPlacementStore {
  /** @param id - Indicator row ID. @returns Its placement, when currently targeted. */
  get(id: string): DropPlacement | null;
  /** @param id - Indicator row ID. @param listener - Focused change callback. @returns Its disposer. */
  subscribe(id: string, listener: () => void): () => void;
  /** @param id - Block row ID. @returns Whether that moved root is active. */
  isDragged(id: string): boolean;
  /** @param id - Block row ID. @returns Whether its handle owns dnd-kit registration. */
  isArmed(id: string): boolean;
  /** @param id - Hovered or focused handle ID. @returns No value. */
  arm(id: string): void;
  /** @param id - Armed block ID. @returns Its live dnd-kit handle registration. */
  getDraggable(id: string): ReturnType<typeof useDraggable> | null;
  /** @param id - Armed block ID. @param value - Live registration or null. @returns No value. */
  setDraggable(id: string, value: ReturnType<typeof useDraggable> | null): void;
  /** @returns Whether row drop targets are enabled for keyboard dragging. */
  isKeyboardDragging(): boolean;
  /** @param active - Whether keyboard collision targets must be mounted. @returns No value. */
  setKeyboardDragging(active: boolean): void;
  /** @param ids - Moved root IDs for the current gesture. @returns No value. */
  setDragged(ids: readonly string[]): void;
  /** @param placement - Latest valid placement, or null to clear feedback. @returns No value. */
  set(placement: DropPlacement | null): void;
}

/** Tests semantic placement equality so pointer jitter inside one zone is free. */
function sameDropPlacement(left: DropPlacement | null, right: DropPlacement | null): boolean {
  return left === right || Boolean(left && right
    && left.targetId === right.targetId
    && left.position === right.position
    && left.indicatorId === right.indicatorId
    && left.indicatorEdge === right.indicatorEdge
    && left.indicatorOffset === right.indicatorOffset
    && left.indicatorAxis === right.indicatorAxis);
}

/** Creates a placement store whose updates notify only affected indicator rows. */
function createDropPlacementStore(): DropPlacementStore {
  let current: DropPlacement | null = null;
  let dragged = new Set<string>();
  let armedId: string | undefined;
  let keyboardDragging = false;
  const draggables = new Map<string, ReturnType<typeof useDraggable>>();
  const listeners = new Map<string, Set<() => void>>();
  const emit = (ids: ReadonlySet<string | undefined>): void => ids.forEach((id) => {
    if (id) [...(listeners.get(id) ?? [])].forEach((listener) => listener());
  });
  return {
    get: (id) => current?.indicatorId === id ? current : null,
    subscribe: (id, listener) => {
      let rowListeners = listeners.get(id);
      if (!rowListeners) {
        rowListeners = new Set();
        listeners.set(id, rowListeners);
      }
      rowListeners.add(listener);
      return () => {
        rowListeners!.delete(listener);
        if (!rowListeners!.size) listeners.delete(id);
      };
    },
    isDragged: (id) => dragged.has(id),
    isArmed: (id) => armedId === id,
    arm: (id) => {
      if (dragged.size || armedId === id) return;
      const previous = armedId;
      armedId = id;
      emit(new Set([previous, id]));
    },
    getDraggable: (id) => draggables.get(id) ?? null,
    setDraggable: (id, value) => {
      const previous = draggables.get(id) ?? null;
      if (previous === value) return;
      if (value) draggables.set(id, value);
      else draggables.delete(id);
      emit(new Set([id]));
    },
    isKeyboardDragging: () => keyboardDragging,
    setKeyboardDragging: (active) => {
      if (keyboardDragging === active) return;
      keyboardDragging = active;
      emit(new Set(listeners.keys()));
    },
    setDragged: (ids) => {
      const next = new Set(ids);
      const changed = new Set<string>([...dragged, ...next].filter((id) => dragged.has(id) !== next.has(id)));
      dragged = next;
      emit(changed);
    },
    set: (placement) => {
      if (sameDropPlacement(current, placement)) return;
      const changedIds = new Set([current?.indicatorId, placement?.indicatorId]);
      current = placement;
      emit(changedIds);
    },
  };
}

/**
 * Connects the provider-level gesture calculation to every recursive row.
 *
 * A harmless empty value lets wrappers render outside PageDragPlugin during
 * tests or when a host registers the wrapper without the provider.
 */
const PageDragStateContext = createContext<PageDragState>({
  placements: createDropPlacementStore(),
});
interface PageDragItemState {
  readonly blockId: string;
  readonly placements: DropPlacementStore;
}
const PageDragItemContext = createContext<PageDragItemState | null>(null);

/** Uses all row rectangles for keyboard movement and one surface target for pointers. */
const pageDragCollisionDetection: CollisionDetection = (params) => {
  const blockTargets = params.droppableContainers.filter(({ id }) => id !== PAGE_DRAG_SURFACE_ID);
  return closestCenter({
    ...params,
    droppableContainers: blockTargets.length ? blockTargets : params.droppableContainers,
  });
};

/** Properties for the page drag-and-drop boundary. */
export interface PageDragExtensionOptions {
  /** Outline surface whose blocks participate in this drag context. */
  readonly children: ReactNode;
  /** Pointer movement in pixels required before dragging starts. Defaults to 4. */
  readonly activationDistance?: number;
  /** Horizontal pointer distance represented by one nesting level. Defaults to 24. */
  readonly childDropIndent?: number;
  /** Pixels at each row edge included in the neighboring insertion gap. Defaults to 4. */
  readonly gapDropZone?: number;
}

/**
 * Adds every ID in a block's complete persisted subtree to one lookup set.
 *
 * This deliberately includes collapsed descendants: they are hidden visually
 * but remain owned by the moved root and therefore cannot be valid targets.
 *
 * @param block - Root of the subtree to inspect.
 * @param ids - Mutable drag-local set receiving the subtree IDs.
 * @returns No value.
 */
function collectSubtreeIds(block: Block, ids: Set<string>): void {
  ids.add(block.id);
  block.children.forEach((child) => collectSubtreeIds(child, ids));
}

interface RowGeometry {
  readonly id: string;
  readonly rect: Pick<DOMRect, "top" | "bottom" | "left" | "height">;
}

function closestPageRow(rows: readonly RowGeometry[], y: number): RowGeometry | undefined {
  const hovered = rows
    .filter(({ rect }) => y >= rect.top && y <= rect.bottom)
    .sort((left, right) => Math.abs(y - (left.rect.top + left.rect.height / 2))
      - Math.abs(y - (right.rect.top + right.rect.height / 2)))[0];
  const preceding = rows
    .filter(({ rect }) => rect.bottom < y)
    .sort((left, right) => right.rect.bottom - left.rect.bottom)[0];
  const following = [...rows].sort((left, right) => left.rect.top - right.rect.top)[0];
  return hovered ?? preceding ?? following;
}

function resolveGeometryPlacement(
  blocks: Block[],
  row: RowGeometry,
  cursorX: number,
  cursorY: number,
  childDropIndent: number,
  gapDropZone: number,
): DropPlacement | null {
  const edgeSize = Math.min(gapDropZone, row.rect.height / 3);
  let result: DropPlacement | null = null;
  if (cursorY >= row.rect.top + edgeSize && cursorY <= row.rect.bottom - edgeSize) {
    result = {
      targetId: row.id,
      position: "inside",
      indicatorId: row.id,
      indicatorOffset: 0,
    };
  } else if (cursorY <= row.rect.bottom - edgeSize) {
    result = {
      targetId: row.id,
      position: "before",
      indicatorId: row.id,
      indicatorEdge: "before",
      indicatorOffset: 0,
    };
  } else {
    const depthOffset = Math.trunc((cursorX - row.rect.left) / childDropIndent);
    const placement = resolveAfterDropPlacement(blocks, row.id, depthOffset);
    result = placement ? {
      targetId: placement.targetId,
      position: placement.position,
      indicatorId: row.id,
      indicatorEdge: "after",
      indicatorOffset: placement.depthOffset * PAGE_INDENT,
    } : null;
  }
  return result;
}

function resolveCrossDocumentPageRootPlacement(
  editor: ReturnType<typeof useEditor>,
  root: HTMLElement,
  x: number,
  y: number,
  childDropIndent: number,
  gapDropZone: number,
): (CrossDocumentBlockTransferPlacement & { readonly indicator: DropPlacement | null }) | null {
  const rows = [...root.querySelectorAll<HTMLElement>("[data-block-id]")].flatMap((block) => {
    const row = block.querySelector<HTMLElement>(":scope > .page-block-row");
    const id = block.dataset.blockId;
    return row && id ? [{ id, rect: row.getBoundingClientRect() }] : [];
  });
  let result: (CrossDocumentBlockTransferPlacement & { readonly indicator: DropPlacement | null }) | null = null;
  if (rows.length === 0) {
    result = { targetId: null, position: "after", indicator: null };
  } else {
    const row = closestPageRow(rows, y);
    if (row) {
      const indicator = resolveGeometryPlacement(
        editor.blocks.getBlocks(),
        row,
        x,
        y,
        childDropIndent,
        gapDropZone,
      );
      result = indicator ? {
        targetId: indicator.targetId,
        position: indicator.position,
        indicator,
      } : null;
    }
  }
  return result;
}

/**
 * Resolves the insertion line nearest the pointer.
 *
 * A pointer over the row body appends inside that block and highlights it. A
 * pointer in a gap renders a line; horizontal movement then snaps that line to
 * every structurally available depth.
 *
 * @param event - Current dnd-kit movement including the active and over rects.
 * @param blocks - Latest complete document tree used to resolve ancestor depth.
 * @param childDropIndent - Horizontal pixels representing one requested depth.
 * @param gapDropZone - Vertical pixels reserved at the top and bottom of a row.
 * @returns A valid candidate destination and indicator, or null when the
 * pointer is not over a registered row.
 */
function resolveDropPlacement(
  event: DragMoveEvent,
  blocks: Block[],
  childDropIndent: number,
  gapDropZone: number,
): DropPlacement | null {
  if (!event.over) return null;
  const indicatorId = String(event.over.id);
  const activator = event.activatorEvent as Event & { clientX?: unknown; clientY?: unknown };
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  const pointerX = typeof activator.clientX === "number" ? activator.clientX : undefined;
  const cursorX = pointerX !== undefined
    ? pointerX + event.delta.x
    : activeRect ? activeRect.left + activeRect.width / 2 : event.over.rect.left;
  const cursorY = typeof activator.clientY === "number"
    ? activator.clientY + event.delta.y
    : activeRect ? activeRect.top + activeRect.height / 2 : event.over.rect.top;
  const hasPointerY = typeof activator.clientY === "number";
  let result: DropPlacement | null = null;
  if (event.active.data.current?.sortChildren === "horizontal"
    && event.over.data.current?.sortChildren === "horizontal") {
    const edge = cursorX < event.over.rect.left + event.over.rect.width / 2 ? "before" : "after";
    result = { targetId: indicatorId, position: edge, indicatorId, indicatorEdge: edge,
      indicatorOffset: 0, indicatorAxis: "horizontal" };
  } else if (event.over.data.current?.sortChildren === "grid") {
    // Outer edges insert siblings in reading order; the center nests blocks.
    const rect = event.over.rect;
    const verticalEdge = Math.min(gapDropZone, rect.height / 3);
    const horizontalEdge = Math.min(32, rect.width / 4);
    const vertical = cursorY < rect.top + verticalEdge || cursorY > rect.bottom - verticalEdge;
    const horizontal = cursorX < rect.left + horizontalEdge || cursorX > rect.right - horizontalEdge;
    const edge = vertical ? (cursorY < rect.top + rect.height / 2 ? "before" : "after")
      : (cursorX < rect.left + rect.width / 2 ? "before" : "after");
    result = { targetId: indicatorId, position: vertical || horizontal ? edge : "inside", indicatorId,
      indicatorEdge: vertical || horizontal ? edge : undefined, indicatorOffset: 0,
      indicatorAxis: !vertical && horizontal ? "horizontal" : undefined };
  } else if (event.over.data.current?.sortChildren === "vertical") {
    // List cards are siblings, even when they own descendants. Splitting the
    // complete card in half makes reordering forgiving without nesting cards.
    const edge = cursorY < event.over.rect.top + event.over.rect.height / 2 ? "before" : "after";
    result = {
      targetId: indicatorId,
      position: edge,
      indicatorId,
      indicatorEdge: edge,
      indicatorOffset: 0,
    };
  } else if (pointerX !== undefined && hasPointerY) {
    result = resolveGeometryPlacement(
      blocks,
      { id: indicatorId, rect: event.over.rect },
      cursorX,
      cursorY,
      childDropIndent,
      gapDropZone,
    );
  } else {
    const edgeSize = Math.min(gapDropZone, event.over.rect.height / 3);
    if (hasPointerY
      && cursorY >= event.over.rect.top + edgeSize
      && cursorY <= event.over.rect.bottom - edgeSize) {
      result = {
        targetId: indicatorId,
        position: "inside",
        indicatorId,
        indicatorOffset: 0,
      };
    } else {
      const after = hasPointerY
        ? cursorY > event.over.rect.bottom - edgeSize
        : cursorY >= event.over.rect.top + event.over.rect.height / 2;
      if (!after) {
        result = {
          targetId: indicatorId,
          position: "before",
          indicatorId,
          indicatorEdge: "before",
          indicatorOffset: 0,
        };
      } else {
        const depthOffset = 0;
        const placement = resolveAfterDropPlacement(blocks, indicatorId, depthOffset);
        result = placement ? {
          targetId: placement.targetId,
          position: placement.position,
          indicatorId,
          indicatorEdge: "after",
          indicatorOffset: placement.depthOffset * PAGE_INDENT,
        } : null;
      }
    }
  }
  return result;
}

/**
 * Resolves only the block beneath the pointer through native hit testing.
 *
 * dnd-kit otherwise measures every mounted row before a pointer drag and scans
 * all of those rectangles on every move. The browser already maintains this
 * hit-test index, so one target rectangle is sufficient.
 *
 * @param event - Current drag movement used for source data and pointer delta.
 * @param root - Active editor surface containing eligible block rows.
 * @param allowNearestContainer - Whether clipped page lanes may be chosen by proximity.
 * @returns Event carrying the one live DOM target, or null over blank space.
 */
function withPointerDropTarget(
  event: DragMoveEvent,
  root: HTMLElement | null,
  allowNearestContainer: boolean,
): DragMoveEvent | null {
  const pointer = eventPointer(event);
  if (!pointer || !root) return null;
  const candidates = new Set<HTMLElement>();
  root.ownerDocument.elementsFromPoint(pointer.x, pointer.y).forEach((element) => {
    let block = element.closest<HTMLElement>(PAGE_BLOCK_SELECTOR);
    while (block && root.contains(block)) {
      candidates.add(block);
      block = block.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR) ?? null;
    }
  });
  let blockElement = [...candidates].map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
  })).filter(({ rect }) => (
    pointer.x >= rect.left && pointer.x <= rect.right
    && pointer.y >= rect.top && pointer.y <= rect.bottom
  )).sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height)[0]?.element;
  if (!blockElement && allowNearestContainer) {
    const containers = new Set([...root.querySelectorAll<HTMLElement>("[data-block-drop-container]")]
      .flatMap((element) => element.closest<HTMLElement>(PAGE_BLOCK_SELECTOR) ?? []));
    blockElement = [...containers].map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .sort((left, right) => Math.hypot(
        pointer.x - left.rect.left - left.rect.width / 2,
        pointer.y - left.rect.top - left.rect.height / 2,
      ) - Math.hypot(
        pointer.x - right.rect.left - right.rect.width / 2,
        pointer.y - right.rect.top - right.rect.height / 2,
      ))[0]?.element;
  }
  const id = blockElement?.dataset.blockId;
  const row = blockElement?.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`) ?? null;
  if (!blockElement || !id || !row) return null;
  const parentRow = blockElement.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR)
    ?.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
  const axis = parentRow?.querySelector("[data-block-sort-children]")?.getAttribute("data-block-sort-children");
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const dropNode = sortable || row.querySelector("[data-block-drop-container]") ? blockElement : row;
  return {
    ...event,
    over: {
      id,
      rect: dropNode.getBoundingClientRect(),
      disabled: false,
      data: { current: {
        sortChildren: axis,
        sortOwner: parentRow?.parentElement?.getAttribute("data-block-id"),
      } },
    },
  } as DragMoveEvent;
}

/** One visible row in the height-limited, pre-order subtree preview. */
interface PreviewEntry {
  /** Detached block snapshot whose label is displayed. */
  readonly block: Block;
  /** Relative nesting depth used only for preview indentation. */
  readonly depth: number;
}

/**
 * Flattens one subtree in visible page order while retaining relative depth.
 *
 * Collapsed descendants are omitted from visible rows; `subtreeSize` counts
 * them separately so the preview can still report hidden moved content.
 *
 * @param block - Root snapshot to flatten.
 * @param depth - Current relative nesting depth used by recursive calls.
 * @returns Pre-order entries suitable for direct preview rendering.
 */
function flattenPreview(block: Block, collapseActive: boolean, depth = 0): PreviewEntry[] {
  return [
    { block, depth },
    ...(collapseActive && block.listProps.collapsed === true
      ? []
      : block.children.flatMap((child) => flattenPreview(child, collapseActive, depth + 1))),
  ];
}

/**
 * Counts every node owned by one moved root, including collapsed descendants.
 *
 * @param block - Root snapshot whose complete subtree is counted.
 * @returns Number of blocks transported by the structural move.
 */
function subtreeSize(block: Block): number {
  return 1 + block.children.reduce((total, child) => total + subtreeSize(child), 0);
}

/**
 * Renders a non-interactive snapshot of one dragged block subtree.
 *
 * The preview uses detached block data instead of BlockTree. Reusing BlockTree
 * here would mount duplicate contenteditable elements and register draggable
 * nodes with the same IDs.
 *
 * @param props - Detached root snapshots participating in this gesture.
 * @returns A capped list of visible rows plus a compact omitted-block count.
 */
function PageDragPreview({ blocks, collapseActive }: { readonly blocks: Block[]; readonly collapseActive: boolean }) {
  const entries = blocks.flatMap((block) => flattenPreview(block, collapseActive));
  const hiddenCount = Math.max(
    0,
    blocks.reduce((total, block) => total + subtreeSize(block), 0) - Math.min(entries.length, MAX_PREVIEW_BLOCKS),
  );

  return (
    <>
      {entries.slice(0, MAX_PREVIEW_BLOCKS).map(({ block: previewBlock, depth }) => (
        <div
          key={previewBlock.id}
          className="page-drag-preview-block"
          style={{ marginLeft: depth * 20 }}
        >
          <div className="page-block-content">
            {previewBlock.content || previewBlock.type}
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="page-drag-preview-more">
          … and {hiddenCount} more block{hiddenCount === 1 ? "" : "s"}
        </div>
      )}
    </>
  );
}

/**
 * Provides structural block drag-and-drop for an outline surface.
 *
 * A selected sibling group moves together when the dragged block belongs to
 * it. Mixed-level selections safely fall back to the handle's single block.
 * Children remain owned by their roots and travel automatically. A block-body drop appends and uses
 * a highlight. A gap drop uses a horizontal line that follows the pointer
 * across every available depth. The resolved move is expressed relative to
 * the preceding block, one of its final ancestors, or its children. Dropping
 * onto the dragged subtree is ignored to prevent an ownership cycle.
 *
 * Grouped movement retains its whole-block selection; single movement replaces
 * any text or mixed selection with the moved block.
 *
 * @param props - Surface subtree and pointer/drop-zone configuration.
 * @returns A dnd-kit provider, shared drag state, source surface, and overlay.
 */
export function PageDragProvider({
  children,
  activationDistance = 4,
  childDropIndent = 24,
  gapDropZone = 8,
}: PageDragExtensionOptions) {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const { element: root } = useEditorRoot();
  const activeMove = useRef<SelectedMoveRoots | undefined>(undefined);
  const crossDocumentTarget = useRef<{
    controller: CrossDocumentPageRootController;
    placement: CrossDocumentBlockTransferPlacement;
  } | null>(null);
  // ponytail: freeze hierarchy for one short gesture; add incremental remote
  // reconciliation only if concurrent drag-time structure edits become common.
  const dragBlocks = useRef<Block[]>([]);
  const draggedSubtreeIds = useRef(new Set<string>());
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const placements = useMemo(createDropPlacementStore, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor),
  );
  const activeBlocks = activeIds.flatMap((id) => {
    const block = editor.blocks.getBlock(id);
    return block ? [block] : [];
  });

  useLayoutEffect(() => {
    if (!root || editor.mode.get() !== "block") return;
    const controller: CrossDocumentPageRootController = {
      editor,
      root,
      setPlacement: (placement, empty = false) => {
        placements.set(placement);
        if (empty) root.setAttribute("data-drop-empty", "true");
        else root.removeAttribute("data-drop-empty");
      },
      resolvePlacement: (x, y) => resolveCrossDocumentPageRootPlacement(
        editor,
        root,
        x,
        y,
        childDropIndent,
        gapDropZone,
      ),
    };
    crossDocumentPageRootControllers.set(root, controller);
    root.setAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE, "true");
    return () => {
      if (crossDocumentPageRootControllers.get(root) === controller) {
        crossDocumentPageRootControllers.delete(root);
      }
      root.removeAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE);
      root.removeAttribute("data-drop-empty");
    };
  }, [childDropIndent, editor, gapDropZone, placements, root]);

  const clearCrossDocumentTarget = () => {
    crossDocumentTarget.current?.controller.setPlacement(null);
    crossDocumentTarget.current = null;
  };

  const updateCrossDocumentTarget = (event: DragMoveEvent): boolean => {
    if (editor.mode.get() !== "block") return false;
    const pointer = eventPointer(event);
    const controller = pointer ? findCrossDocumentPageController(root, pointer) : null;
    let handled = false;
    if (!pointer || !controller) {
      clearCrossDocumentTarget();
    } else {
      if (crossDocumentTarget.current?.controller !== controller) clearCrossDocumentTarget();
      const placement = controller.resolvePlacement(pointer.x, pointer.y);
      controller.setPlacement(placement?.indicator ?? null, placement?.targetId === null);
      crossDocumentTarget.current = placement ? {
        controller,
        placement: { targetId: placement.targetId, position: placement.position },
      } : null;
      handled = true;
    }
    return handled;
  };

  /** Removes feedback for targets owned by any currently moved subtree. */
  const validPlacement = (event: DragMoveEvent): DropPlacement | null => {
    const zoom = editor.mode.get() === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const blocks = dragBlocks.current.length ? dragBlocks.current : editor.blocks.getBlocks();
    const targetedEvent = eventPointer(event)
      ? withPointerDropTarget(event, root, editor.mode.get() === "block")
      : event.over?.id !== PAGE_DRAG_SURFACE_ID ? event : null;
    const placement = targetedEvent
      ? resolveDropPlacement(targetedEvent, blocks, childDropIndent * zoom, gapDropZone)
      : null;
    if (!placement) return null;
    return draggedSubtreeIds.current.has(placement.targetId) ? null : placement;
  };
  /**
   * Freezes the eligible move roots when activation begins.
   *
   * Selection can otherwise change while the pointer is moving. Capturing the
   * roots once keeps the preview and final atomic move consistent.
   *
   * @param event - dnd-kit start event containing the handle's block ID.
   */
  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    clearCrossDocumentTarget();
    const blocks = editor.blocks.getBlocks();
    const move = selectedMoveRoots(
      blocks,
      editor.selection.get(),
      String(active.id),
      (block) => reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true,
    );
    const subtreeIds = new Set<string>();
    move.ids.forEach((id) => {
      const block = editor.blocks.getBlock(id);
      if (block) collectSubtreeIds(block, subtreeIds);
    });
    dragBlocks.current = blocks;
    draggedSubtreeIds.current = subtreeIds;
    activeMove.current = move;
    const KeyboardEventType = root?.ownerDocument.defaultView?.KeyboardEvent;
    placements.setKeyboardDragging(Boolean(KeyboardEventType && activatorEvent instanceof KeyboardEventType));
    placements.setDragged(move.ids);
    setActiveIds(move.ids);
  };

  /**
   * Commits the last valid structural destination and reconciles selection.
   *
   * @param event - Final pointer geometry and target supplied by dnd-kit.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const move = activeMove.current;
    const crossDocument = crossDocumentTarget.current;
    const placement = crossDocument ? null : validPlacement(event);
    activeMove.current = undefined;
    dragBlocks.current = [];
    draggedSubtreeIds.current.clear();
    placements.setKeyboardDragging(false);
    placements.setDragged([]);
    setActiveIds([]);
    placements.set(null);
    clearCrossDocumentTarget();
    if (crossDocument && move) {
      let transferred = false;
      try {
        crossDocumentBlockTransfer(
          editor,
          crossDocument.controller.editor,
          move.ids,
          crossDocument.placement,
        );
        transferred = true;
      } catch {
        transferred = false;
      }
      if (transferred) {
        editor.selection.clear();
        const firstId = move.ids[0]!;
        const lastId = move.ids.at(-1)!;
        crossDocument.controller.editor.selection.set(
          createStructuralSelection([...move.ids], firstId, lastId),
        );
        requestAnimationFrame(() => crossDocument.controller.root.focus({ preventScroll: true }));
      }
    } else if (placement && move) {
      const { targetId, position } = placement;
      editor.blocks.moveBlocks(move.ids, targetId, position);
      const selection = move.grouped && move.selection
        ? move.selection
        : createStructuralSelection([move.ids[0]!]);
      editor.selection.set(selection);
      requestAnimationFrame(() => root?.focus({ preventScroll: true }));
    }
  };

  // Native modal dialogs occupy the top layer; previews must join that layer.
  const modalRoot = root?.querySelector("dialog:modal");
  const overlay = (
    <DragOverlay dropAnimation={null}>
      {activeBlocks.length > 0 && (
        <div className="page-drag-overlay" aria-hidden="true">
          <PageDragPreview blocks={activeBlocks} collapseActive={reactEditor.blocks.hasListProps("collapse")} />
        </div>
      )}
    </DragOverlay>
  );
  const dragContext = useMemo(() => ({ placements }), [placements]);

  return (
    <PageDragStateContext.Provider value={dragContext}>
      <DndContext
        sensors={sensors}
        collisionDetection={pageDragCollisionDetection}
        autoScroll={{ canScroll: canPageDragAutoScroll }}
        onDragStart={handleDragStart}
        onDragMove={(event) => {
          if (updateCrossDocumentTarget(event)) placements.set(null);
          else placements.set(validPlacement(event));
        }}
        onDragCancel={() => {
          activeMove.current = undefined;
          dragBlocks.current = [];
          draggedSubtreeIds.current.clear();
          placements.setKeyboardDragging(false);
          placements.setDragged([]);
          setActiveIds([]);
          placements.set(null);
          clearCrossDocumentTarget();
        }}
        onDragEnd={handleDragEnd}
      >
        <PageDragSurfaceDropTarget root={root} />
        {children}
        {modalRoot ? createPortal(overlay, modalRoot) : overlay}
      </DndContext>
    </PageDragStateContext.Provider>
  );
}

/** Registers one surface-sized dnd-kit target; block targeting uses native hit testing. */
function PageDragSurfaceDropTarget({ root }: { readonly root: HTMLElement | null }) {
  const droppable = useDroppable({ id: PAGE_DRAG_SURFACE_ID });
  useLayoutEffect(() => {
    droppable.setNodeRef(root);
    return () => droppable.setNodeRef(null);
  }, [droppable.setNodeRef, root]);
  return null;
}

/**
 * Decorates one BlockTree-owned BlockView with structural drag behavior.
 *
 * The decorator contributes a BlockView ref through context. Its handle and
 * indicator are portalled into that row, preserving the surface DOM contract
 * without rendering a second BlockView.
 *
 * This component is registered through `registerBlockWrapper`; page and
 * edgeless surfaces never import it. The button alone activates the draggable
 * sensor, so editable content retains ordinary caret and selection behavior.
 *
 * @param props - Block snapshot and the next ordered decorator or shared shell.
 * @returns A DOM-free ref provider plus row-portalled drag controls.
 */
export function PageDragBlockWrapper({ block, children }: BlockWrapperProps) {
  const [blockElement, setBlockElement] = useState<HTMLDivElement | null>(null);
  const row = blockElement?.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`) ?? null;
  const parentRow = blockElement?.parentElement?.closest("[data-block-id]")
    ?.querySelector(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
  const axis = parentRow?.querySelector("[data-block-sort-children]")?.getAttribute("data-block-sort-children");
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const data = { sortChildren: axis, sortOwner: parentRow?.parentElement?.getAttribute("data-block-id") };
  const dropNode = sortable || row?.querySelector("[data-block-drop-container]") ? blockElement : row;

  return (
    <BlockElementRefProvider elementRef={setBlockElement}>
      <PageDragBlockMechanics
        blockId={block.id}
        blockElement={blockElement}
        dropNode={dropNode}
        sortable={sortable}
        axis={axis}
        data={data}
      >
        {children}
      </PageDragBlockMechanics>
    </BlockElementRefProvider>
  );
}

/**
 * Isolates dnd-kit's broad context updates from the expensive block wrapper.
 *
 * @param props - Stable DOM geometry, block ID, and unchanged rendered subtree.
 * @returns Focused drag registration and visual feedback around the block shell.
 */
function PageDragBlockMechanics({
  blockId,
  blockElement,
  dropNode,
  sortable,
  axis,
  data,
  children,
}: {
  readonly blockId: string;
  readonly blockElement: HTMLDivElement | null;
  readonly dropNode: HTMLElement | null;
  readonly sortable: boolean;
  readonly axis: string | null | undefined;
  readonly data: { readonly sortChildren: string | null | undefined; readonly sortOwner: string | null | undefined };
  readonly children?: ReactNode;
}) {
  const dragState = useContext(PageDragStateContext);
  const subscribePlacement = useCallback(
    (listener: () => void) => dragState.placements.subscribe(blockId, listener),
    [blockId, dragState.placements],
  );
  const getPlacement = useCallback(
    () => dragState.placements.get(blockId),
    [blockId, dragState.placements],
  );
  const indicator = useSyncExternalStore(subscribePlacement, getPlacement, getPlacement) ?? undefined;
  const getDragged = useCallback(
    () => dragState.placements.isDragged(blockId),
    [blockId, dragState.placements],
  );
  const groupedDragging = useSyncExternalStore(subscribePlacement, getDragged, getDragged);
  const getArmed = useCallback(
    () => dragState.placements.isArmed(blockId),
    [blockId, dragState.placements],
  );
  const armed = useSyncExternalStore(subscribePlacement, getArmed, getArmed);
  const getKeyboardDragging = useCallback(
    () => dragState.placements.isKeyboardDragging(),
    [dragState.placements],
  );
  const keyboardDragging = useSyncExternalStore(subscribePlacement, getKeyboardDragging, getKeyboardDragging);
  const itemState = useMemo(() => ({ blockId, placements: dragState.placements }), [blockId, dragState.placements]);
  const previousPosition = useRef<number | undefined>(undefined);

  // Animate committed sibling moves, not pointer motion or scrolling. Offsets
  // stay in the column's layout coordinates and reduced-motion stays instant.
  useLayoutEffect(() => {
    if (!sortable || !blockElement) return;
    const position = axis === "horizontal" ? blockElement.offsetLeft : blockElement.offsetTop;
    const previous = previousPosition.current;
    previousPosition.current = position;
    if (previous !== undefined && previous !== position && !groupedDragging
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animation = blockElement.animate([
        { transform: `translate${axis === "horizontal" ? "X" : "Y"}(${previous - position}px)` },
        { transform: "translate(0)" },
      ], { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      return () => animation.cancel();
    }
  }, [axis, blockElement, groupedDragging, sortable]);

  // Dragging and inside-drop state decorate stable surface elements without
  // moving ownership of their data-block markers into this extension.
  useLayoutEffect(() => {
    if (!blockElement) return;
    if (groupedDragging) blockElement.setAttribute("data-dragging", "true");
    else blockElement.removeAttribute("data-dragging");
    return () => blockElement.removeAttribute("data-dragging");
  }, [blockElement, groupedDragging]);
  useLayoutEffect(() => {
    if (!dropNode) return;
    if (indicator && !indicator.indicatorEdge) {
      dropNode.setAttribute("data-drop-inside", "true");
    } else {
      dropNode.removeAttribute("data-drop-inside");
    }
    return () => dropNode.removeAttribute("data-drop-inside");
  }, [indicator, dropNode]);

  const indicatorPortal = dropNode && indicator?.indicatorEdge ? createPortal(
    <span
      className={PAGE_DROP_LINE_CLASS}
      data-edge={indicator.indicatorEdge}
      data-axis={indicator.indicatorAxis}
      style={indicator.indicatorAxis ? undefined : { left: indicator.indicatorOffset }}
    />,
    dropNode,
  ) : null;

  return (
    <PageDragItemContext.Provider value={itemState}>
      {children}
      {indicatorPortal}
      {armed && <PageDragRegistration blockId={blockId} data={data} placements={dragState.placements} />}
      {keyboardDragging && <PageDragKeyboardDropTarget blockId={blockId} data={data} dropNode={dropNode} />}
    </PageDragItemContext.Provider>
  );
}

/** Mounts dnd-kit's broad-context hook for only the armed block handle. */
function PageDragRegistration({
  blockId,
  data,
  placements,
}: {
  readonly blockId: string;
  readonly data: { readonly sortChildren: string | null | undefined; readonly sortOwner: string | null | undefined };
  readonly placements: DropPlacementStore;
}) {
  const draggable = useDraggable({ id: blockId, data });
  useLayoutEffect(() => {
    placements.setDraggable(blockId, draggable);
    return () => placements.setDraggable(blockId, null);
  }, [blockId, draggable, placements]);
  return null;
}

/** Registers complete row geometry only for the less frequent keyboard gesture. */
function PageDragKeyboardDropTarget({
  blockId,
  data,
  dropNode,
}: {
  readonly blockId: string;
  readonly data: { readonly sortChildren: string | null | undefined; readonly sortOwner: string | null | undefined };
  readonly dropNode: HTMLElement | null;
}) {
  const droppable = useDroppable({ id: blockId, data });
  useLayoutEffect(() => {
    droppable.setNodeRef(dropNode);
    return () => droppable.setNodeRef(null);
  }, [droppable.setNodeRef, dropNode]);
  return null;
}

/**
 * Renders the visible drag activator supplied by the owning drag wrapper.
 *
 * @param props - Current block slot context used for the accessible label.
 * @returns Drag button, or nothing when the mechanical wrapper is absent.
 */
export function PageDragBlockSlot({ block }: BlockSlotProps) {
  const item = useContext(PageDragItemContext);
  const subscribe = useCallback(
    (listener: () => void) => item?.placements.subscribe(block.id, listener) ?? (() => undefined),
    [block.id, item],
  );
  const getDraggable = useCallback(
    () => item?.placements.getDraggable(block.id) ?? null,
    [block.id, item],
  );
  const draggable = useSyncExternalStore(subscribe, getDraggable, getDraggable);
  const arm = useCallback(() => item?.placements.arm(block.id), [block.id, item]);
  if (!item) return null;
  return (
    <button
      {...(draggable?.attributes ?? {})}
      {...(draggable?.listeners ?? {})}
      ref={draggable?.setNodeRef}
      type="button"
      className={PAGE_DRAG_HANDLE_CLASS}
      aria-label={`Move block: ${block.content || block.type}`}
      contentEditable={false}
      onPointerEnter={arm}
      onFocus={arm}
    >
      ⋮⋮
    </button>
  );
}
