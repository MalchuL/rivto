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
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { EditorBlock as Block } from "@chulane/rivto";
import {
  BlockElementRefProvider,
  type BlockWrapperProps,
} from "../../blocks";
import { useEditor, useEditorRoot } from "../../hooks";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
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
const EDGELESS_ROOT_SELECTOR = "[data-edgeless-root]";
const CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE = "data-rivto-cross-document-page-root";
const CROSS_DOCUMENT_PAGE_ROOT_SELECTOR = `[${CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE}]`;

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
  /** Valid destination currently advertised to recursively rendered rows. */
  readonly placement: DropPlacement | null;
  /** Moved root IDs whose rows should share the translucent dragging state. */
  readonly draggedIds: readonly string[];
}

/**
 * Connects the provider-level gesture calculation to every recursive row.
 *
 * A harmless empty value lets wrappers render outside PageDragPlugin during
 * tests or when a host registers the wrapper without the provider.
 */
const PageDragStateContext = createContext<PageDragState>({ placement: null, draggedIds: [] });

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
 * Tests whether an ID belongs to a block's complete persisted subtree.
 *
 * This deliberately includes collapsed descendants: they are hidden visually
 * but remain owned by the moved root and therefore cannot be valid targets.
 *
 * @param block - Root of the subtree to inspect.
 * @param candidateId - Prospective destination ID.
 * @returns True when the root or any descendant has the candidate ID.
 */
function containsBlock(block: Block, candidateId: string): boolean {
  return block.id === candidateId || block.children.some((child) => containsBlock(child, candidateId));
}

/**
 * Selects the block row under the pointer across the complete page width.
 *
 * A pointer inside a row selects its block body. A pointer in a vertical gap
 * selects the closest preceding row, making the gap an unambiguous "after"
 * insertion point across the complete page width. Keyboard dragging retains
 * dnd-kit's nearest-center fallback.
 *
 * @param arguments_ - Rectangles and pointer coordinates supplied by dnd-kit.
 * @returns At most one collision: the row whose body or preceding gap owns the
 * current pointer position.
 */
const pageCollisionDetection: CollisionDetection = (arguments_) => {
  const { pointerCoordinates, droppableContainers, droppableRects } = arguments_;
  if (!pointerCoordinates) return closestCenter(arguments_);
  const rows = droppableContainers.flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return rect ? [{ id: container.id, rect }] : [];
  });
  const hovered = rows
    .filter(({ rect }) => pointerCoordinates.y >= rect.top && pointerCoordinates.y <= rect.bottom)
    .sort((left, right) => Math.abs(pointerCoordinates.y - (left.rect.top + left.rect.height / 2))
      - Math.abs(pointerCoordinates.y - (right.rect.top + right.rect.height / 2)))[0];
  const preceding = rows
    .filter(({ rect }) => rect.bottom < pointerCoordinates.y)
    .sort((left, right) => right.rect.bottom - left.rect.bottom)[0];
  const following = rows.sort((left, right) => left.rect.top - right.rect.top)[0];
  const target = hovered ?? preceding ?? following;
  return target ? [{ id: target.id, data: { value: 0 } }] : [];
};

/**
 * Limits canvas outline collisions to the visually topmost card under the pointer.
 *
 * Rows in different cards commonly share vertical coordinates. Filtering by
 * native hit testing prevents registration order from selecting another card.
 */
const edgelessCollisionDetection: CollisionDetection = (arguments_) => {
  const { pointerCoordinates, droppableContainers } = arguments_;
  if (!pointerCoordinates) return closestCenter(arguments_);
  const document = droppableContainers[0]?.node.current?.ownerDocument;
  const card = document?.elementsFromPoint(pointerCoordinates.x, pointerCoordinates.y)
    .map((element) => element.closest<HTMLElement>(EDGELESS_ROOT_SELECTOR))
    .find((element): element is HTMLElement => Boolean(element));
  if (!card) return [];
  return pageCollisionDetection({
    ...arguments_,
    droppableContainers: droppableContainers.filter(({ node }) => (
      Boolean(node.current && card.contains(node.current))
    )),
  });
};

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
  if (cursorY >= row.rect.top + edgeSize && cursorY <= row.rect.bottom - edgeSize) {
    return {
      targetId: row.id,
      position: "inside",
      indicatorId: row.id,
      indicatorOffset: 0,
    };
  }
  if (cursorY <= row.rect.bottom - edgeSize) {
    return {
      targetId: row.id,
      position: "before",
      indicatorId: row.id,
      indicatorEdge: "before",
      indicatorOffset: 0,
    };
  }
  const depthOffset = Math.trunc((cursorX - row.rect.left) / childDropIndent);
  const placement = resolveAfterDropPlacement(blocks, row.id, depthOffset);
  return placement ? {
    targetId: placement.targetId,
    position: placement.position,
    indicatorId: row.id,
    indicatorEdge: "after",
    indicatorOffset: placement.depthOffset * PAGE_INDENT,
  } : null;
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
  if (rows.length === 0) return { targetId: null, position: "after", indicator: null };
  const row = closestPageRow(rows, y);
  if (!row) return null;
  const indicator = resolveGeometryPlacement(
    editor.blocks.getBlocks(),
    row,
    x,
    y,
    childDropIndent,
    gapDropZone,
  );
  return indicator ? {
    targetId: indicator.targetId,
    position: indicator.position,
    indicator,
  } : null;
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
  if (pointerX !== undefined && hasPointerY) {
    return resolveGeometryPlacement(
      blocks,
      { id: indicatorId, rect: event.over.rect },
      cursorX,
      cursorY,
      childDropIndent,
      gapDropZone,
    );
  }
  const edgeSize = Math.min(gapDropZone, event.over.rect.height / 3);
  if (hasPointerY
    && cursorY >= event.over.rect.top + edgeSize
    && cursorY <= event.over.rect.bottom - edgeSize) {
    return {
      targetId: indicatorId,
      position: "inside",
      indicatorId,
      indicatorOffset: 0,
    };
  }
  const after = hasPointerY
    ? cursorY > event.over.rect.bottom - edgeSize
    : cursorY >= event.over.rect.top + event.over.rect.height / 2;
  if (!after) {
    return {
      targetId: indicatorId,
      position: "before",
      indicatorId,
      indicatorEdge: "before",
      indicatorOffset: 0,
    };
  }

  const depthOffset = 0;
  const placement = resolveAfterDropPlacement(blocks, indicatorId, depthOffset);
  if (!placement) return null;
  return {
    targetId: placement.targetId,
    position: placement.position,
    indicatorId,
    indicatorEdge: "after",
    indicatorOffset: placement.depthOffset * PAGE_INDENT,
  };
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
function flattenPreview(block: Block, depth = 0): PreviewEntry[] {
  return [
    { block, depth },
    ...(block.collapsed
      ? []
      : block.children.flatMap((child) => flattenPreview(child, depth + 1))),
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
 * here would mount duplicate contenteditable elements and register a second set
 * of draggable and droppable nodes with the same IDs.
 *
 * @param props - Detached root snapshots participating in this gesture.
 * @returns A capped list of visible rows plus a compact omitted-block count.
 */
function PageDragPreview({ blocks }: { readonly blocks: Block[] }) {
  const entries = blocks.flatMap((block) => flattenPreview(block));
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
  const { element: root } = useEditorRoot();
  const activeMove = useRef<SelectedMoveRoots | undefined>(undefined);
  const crossDocumentTarget = useRef<{
    controller: CrossDocumentPageRootController;
    placement: CrossDocumentBlockTransferPlacement;
  } | null>(null);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(null);
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
        setDropPlacement(placement);
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
  }, [childDropIndent, editor, gapDropZone, root]);

  const clearCrossDocumentTarget = () => {
    crossDocumentTarget.current?.controller.setPlacement(null);
    crossDocumentTarget.current = null;
  };

  const updateCrossDocumentTarget = (event: DragMoveEvent): boolean => {
    if (editor.mode.get() !== "block") return false;
    const pointer = eventPointer(event);
    const controller = pointer ? findCrossDocumentPageController(root, pointer) : null;
    if (!pointer || !controller) {
      clearCrossDocumentTarget();
      return false;
    }
    if (crossDocumentTarget.current?.controller !== controller) clearCrossDocumentTarget();
    const placement = controller.resolvePlacement(pointer.x, pointer.y);
    controller.setPlacement(placement?.indicator ?? null, placement?.targetId === null);
    crossDocumentTarget.current = placement ? {
      controller,
      placement: { targetId: placement.targetId, position: placement.position },
    } : null;
    return true;
  };

  /** Removes feedback for targets owned by any currently moved subtree. */
  const validPlacement = (event: DragMoveEvent): DropPlacement | null => {
    const zoom = editor.mode.get() === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const placement = resolveDropPlacement(event, editor.blocks.getBlocks(), childDropIndent * zoom, gapDropZone);
    if (!placement) return null;
    const invalid = activeMove.current?.ids.some((id) => {
      const block = editor.blocks.getBlock(id);
      return block ? containsBlock(block, placement.targetId) : false;
    });
    return invalid ? null : placement;
  };
  const collisionDetection: CollisionDetection = (arguments_) => {
    if (editor.mode.get() === "edgeless") return edgelessCollisionDetection(arguments_);
    const pointer = arguments_.pointerCoordinates;
    if (pointer && findCrossDocumentPageController(root, pointer)) return [];
    return pageCollisionDetection(arguments_);
  };

  /**
   * Freezes the eligible move roots when activation begins.
   *
   * Selection can otherwise change while the pointer is moving. Capturing the
   * roots once keeps the preview and final atomic move consistent.
   *
   * @param event - dnd-kit start event containing the handle's block ID.
   */
  const handleDragStart = ({ active }: DragStartEvent) => {
    clearCrossDocumentTarget();
    const move = selectedMoveRoots(editor.blocks.getBlocks(), editor.selection.get(), String(active.id));
    activeMove.current = move;
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
    setActiveIds([]);
    setDropPlacement(null);
    clearCrossDocumentTarget();
    if (crossDocument && move) {
      try {
        crossDocumentBlockTransfer(
          editor,
          crossDocument.controller.editor,
          move.ids,
          crossDocument.placement,
        );
      } catch {
        return;
      }
      editor.selection.clear();
      const firstId = move.ids[0]!;
      const lastId = move.ids.at(-1)!;
      crossDocument.controller.editor.selection.set([{
        type: "block",
        blockIds: [...move.ids],
        anchorBlockId: firstId,
        focusBlockId: lastId,
      }]);
      requestAnimationFrame(() => crossDocument.controller.root.focus({ preventScroll: true }));
      return;
    }
    if (!placement || !move) return;

    const { targetId, position } = placement;
    editor.blocks.moveBlocks(move.ids, targetId, position);
    const selection = move.grouped && move.selection
      ? move.selection
      : {
          type: "block" as const,
          blockIds: [move.ids[0]!],
          anchorBlockId: move.ids[0]!,
          focusBlockId: move.ids[0]!,
    };
    editor.selection.set([selection]);
    requestAnimationFrame(() => root?.focus({ preventScroll: true }));
  };

  return (
    <PageDragStateContext.Provider value={{ placement: dropPlacement, draggedIds: activeIds }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={(event) => {
          if (updateCrossDocumentTarget(event)) setDropPlacement(null);
          else setDropPlacement(validPlacement(event));
        }}
        onDragCancel={() => {
          activeMove.current = undefined;
          setActiveIds([]);
          setDropPlacement(null);
          clearCrossDocumentTarget();
        }}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeBlocks.length > 0 && (
            <div className="page-drag-overlay" aria-hidden="true">
              <PageDragPreview blocks={activeBlocks} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </PageDragStateContext.Provider>
  );
}

/**
 * Decorates one BlockTree-owned BlockView with structural drag behavior.
 *
 * The decorator contributes a BlockView ref through context, then attaches the
 * dnd-kit droppable directly to the existing row. Its handle and indicator are
 * portalled into that row, preserving the surface DOM contract and collision
 * geometry without rendering a second BlockView.
 *
 * This component is registered through `registerBlockWrapper`; page and
 * edgeless surfaces never import it. The button alone activates the draggable
 * sensor, so editable content retains ordinary caret and selection behavior.
 *
 * @param props - Block snapshot and the next ordered decorator or shared shell.
 * @returns A DOM-free ref provider plus row-portalled drag controls.
 */
export function PageDragBlockWrapper({ block, children }: BlockWrapperProps) {
  const draggable = useDraggable({ id: block.id });
  const droppable = useDroppable({ id: block.id });
  const dragState = useContext(PageDragStateContext);
  const [blockElement, setBlockElement] = useState<HTMLDivElement | null>(null);
  const dropPlacement = dragState.placement;
  const indicator = dropPlacement?.indicatorId === block.id ? dropPlacement : undefined;
  const row = blockElement?.querySelector<HTMLElement>(":scope > .page-block-row") ?? null;
  const dragging = draggable.isDragging || dragState.draggedIds.includes(block.id);

  // dnd-kit accepts a node imperatively, allowing the decorator to reuse the
  // surface's exact row instead of cloning or replacing its React element.
  useLayoutEffect(() => {
    droppable.setNodeRef(row);
    return () => droppable.setNodeRef(null);
  }, [droppable.setNodeRef, row]);

  // Dragging and inside-drop state decorate stable surface elements without
  // moving ownership of their data-block markers into this extension.
  useLayoutEffect(() => {
    if (!blockElement) return;
    if (dragging) blockElement.setAttribute("data-dragging", "true");
    else blockElement.removeAttribute("data-dragging");
    return () => blockElement.removeAttribute("data-dragging");
  }, [blockElement, dragging]);
  useLayoutEffect(() => {
    if (!row) return;
    if (indicator && !indicator.indicatorEdge) {
      row.setAttribute("data-drop-inside", "true");
    } else {
      row.removeAttribute("data-drop-inside");
    }
    return () => row.removeAttribute("data-drop-inside");
  }, [indicator, row]);

  const controls = row ? createPortal(
    <>
        <button
          {...draggable.attributes}
          {...draggable.listeners}
          ref={draggable.setNodeRef}
          type="button"
          className="page-drag-handle"
          aria-label={`Move block: ${block.content || block.type}`}
          contentEditable={false}
        >
          ⋮⋮
        </button>
        {indicator?.indicatorEdge && (
          <span
            className="page-drop-line"
            data-edge={indicator.indicatorEdge}
            style={{ left: indicator.indicatorOffset }}
          />
        )}
    </>,
    row,
  ) : null;

  return (
    <BlockElementRefProvider elementRef={setBlockElement}>
      {children}
      {controls}
    </BlockElementRefProvider>
  );
}
