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
import {
  BlockView,
  isBlockCollapsed,
  useEditor,
  type EditorBlock,
} from "../internal";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveAfterDropPlacement } from "./page-drag-placement";
import { selectedMoveRoots, type SelectedMoveRoots } from "./page-selection";

/** Maximum number of block rows rendered inside the floating preview. */
const MAX_PREVIEW_BLOCKS = 4;

/** Visual nesting used by `.page-block-children` in the demo stylesheet. */
const PAGE_INDENT = 24;

/** Insertion line currently selected by the pointer. */
interface DropPlacement {
  /** Block used by the document move operation. */
  readonly targetId: string;
  readonly position: "before" | "after" | "inside";
  /** Hovered row that owns the visible insertion line. */
  readonly indicatorId: string;
  /** Missing for a block-body highlight; present for a gap insertion line. */
  readonly indicatorEdge?: "before" | "after";
  /** Horizontal line offset relative to the hovered row. */
  readonly indicatorOffset: number;
}

/** Drag state shared with recursively rendered page blocks. */
interface PageDragState {
  readonly placement: DropPlacement | null;
  readonly draggedIds: readonly string[];
}

const PageDragStateContext = createContext<PageDragState>({ placement: null, draggedIds: [] });

/** Properties for the page drag-and-drop boundary. */
export interface PageDragPluginProps {
  /** Outline surface whose blocks participate in this drag context. */
  readonly children: ReactNode;
  /** Pointer movement in pixels required before dragging starts. Defaults to 4. */
  readonly activationDistance?: number;
  /** Horizontal pointer distance represented by one nesting level. Defaults to 24. */
  readonly childDropIndent?: number;
  /** Pixels at each row edge included in the neighboring insertion gap. Defaults to 4. */
  readonly gapDropZone?: number;
}

/** Properties for one draggable page block container. */
export interface PageDraggableBlockProps {
  /** Current detached block rendered by this container. */
  readonly block: EditorBlock;
  /** Whether the surface currently renders the whole block as selected. */
  readonly selected: boolean;
  /** Surface-owned renderer for this block's own row. */
  readonly content: ReactNode;
  /** Optional surface controls placed beside the drag handle. */
  readonly controls?: ReactNode;
  /** Recursively rendered child blocks placed below this block's own row. */
  readonly children?: ReactNode;
}

/** Returns whether a block subtree contains a candidate ID. */
function containsBlock(block: EditorBlock, candidateId: string): boolean {
  return block.id === candidateId || block.children.some((child) => containsBlock(child, candidateId));
}

/**
 * Selects the block row under the pointer across the complete page width.
 *
 * A pointer inside a row selects its block body. A pointer in a vertical gap
 * selects the closest preceding row, making the gap an unambiguous "after"
 * insertion point across the complete page width. Keyboard dragging retains
 * dnd-kit's nearest-center fallback.
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
 * Resolves the insertion line nearest the pointer.
 *
 * A pointer over the row body appends inside that block and highlights it. A
 * pointer in a gap renders a line; horizontal movement then snaps that line to
 * every structurally available depth.
 */
function resolveDropPlacement(
  event: DragMoveEvent,
  blocks: EditorBlock[],
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

  const depthOffset = pointerX === undefined
    ? 0
    : Math.trunc((cursorX - event.over.rect.left) / childDropIndent);
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

/** One flattened row in the height-limited subtree preview. */
interface PreviewEntry {
  readonly block: EditorBlock;
  readonly depth: number;
}

/** Flattens a subtree in visible order while retaining indentation depth. */
function flattenPreview(block: EditorBlock, depth = 0): PreviewEntry[] {
  return [
    { block, depth },
    ...(isBlockCollapsed(block)
      ? []
      : block.children.flatMap((child) => flattenPreview(child, depth + 1))),
  ];
}

/** Counts the complete moved subtree, including children hidden by collapse. */
function subtreeSize(block: EditorBlock): number {
  return 1 + block.children.reduce((total, child) => total + subtreeSize(child), 0);
}

/**
 * Renders a non-interactive snapshot of one dragged block subtree.
 *
 * The preview uses detached block data instead of PageBlock. Reusing PageBlock
 * here would mount duplicate contenteditable elements and register a second set
 * of draggable and droppable nodes with the same IDs. Stable type attributes
 * let the preview reuse the demo's Markdown and custom-block presentation.
 */
function PageDragPreview({ blocks }: { readonly blocks: EditorBlock[] }) {
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
          data-block-type={previewBlock.type}
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
 */
export function PageDragPlugin({
  children,
  activationDistance = 4,
  childDropIndent = 24,
  gapDropZone = 8,
}: PageDragPluginProps) {
  const editor = useEditor();
  const activeMove = useRef<SelectedMoveRoots | undefined>(undefined);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor),
  );
  const activeBlocks = activeIds.flatMap((id) => {
    const block = editor.getBlock(id);
    return block ? [block] : [];
  });

  /** Removes feedback for targets owned by any currently moved subtree. */
  const validPlacement = (event: DragMoveEvent): DropPlacement | null => {
    const placement = resolveDropPlacement(event, editor.getBlocks(), childDropIndent, gapDropZone);
    if (!placement) return null;
    const invalid = activeMove.current?.ids.some((id) => {
      const block = editor.getBlock(id);
      return block ? containsBlock(block, placement.targetId) : false;
    });
    return invalid ? null : placement;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const move = selectedMoveRoots(editor.getBlocks(), editor.selection.get(), String(active.id));
    activeMove.current = move;
    setActiveIds(move.ids);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const move = activeMove.current;
    const placement = validPlacement(event);
    activeMove.current = undefined;
    setActiveIds([]);
    setDropPlacement(null);
    if (!placement || !move) return;

    const { targetId, position } = placement;
    editor.moveBlocks(move.ids, targetId, position);
    const selection = move.grouped && move.selection
      ? move.selection
      : {
          type: "block" as const,
          blockIds: [move.ids[0]!],
          anchorBlockId: move.ids[0]!,
          focusBlockId: move.ids[0]!,
        };
    editor.execute("selection.set", { selection: [selection] });
  };

  return (
    <PageDragStateContext.Provider value={{ placement: dropPlacement, draggedIds: activeIds }}>
      <DndContext
        sensors={sensors}
        collisionDetection={pageCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={(event) => setDropPlacement(validPlacement(event))}
        onDragCancel={() => {
          activeMove.current = undefined;
          setActiveIds([]);
          setDropPlacement(null);
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
 * Renders one BlockView with a dnd-kit drop target and dedicated drag handle.
 *
 * Only the block's own row is a drop target; nested rows register themselves.
 * The button alone activates the draggable sensor. Keeping listeners off
 * editable content prevents ordinary caret placement and text selection from
 * accidentally beginning a drag.
 */
export function PageDraggableBlock({ block, selected, content, controls, children }: PageDraggableBlockProps) {
  const draggable = useDraggable({ id: block.id });
  const droppable = useDroppable({ id: block.id });
  const dragState = useContext(PageDragStateContext);
  const dropPlacement = dragState.placement;
  const indicator = dropPlacement?.indicatorId === block.id ? dropPlacement : undefined;

  return (
    <BlockView
      block={block}
      selected={selected}
      className="page-block"
      data-dragging={draggable.isDragging || dragState.draggedIds.includes(block.id) ? "true" : undefined}
    >
      <div
        ref={droppable.setNodeRef}
        className="page-block-row"
        data-block-type={block.type}
        data-drop-inside={indicator && !indicator.indicatorEdge ? "true" : undefined}
      >
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
        {controls}
        {content}
        {indicator?.indicatorEdge && (
          <span
            className="page-drop-line"
            data-edge={indicator.indicatorEdge}
            style={{ left: indicator.indicatorOffset }}
          />
        )}
      </div>
      {children}
    </BlockView>
  );
}
