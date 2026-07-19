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
  useEditor,
  type EditorBlock,
} from "@chulane/rivto";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

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

/** Shares the current insertion edge with recursively rendered page blocks. */
const PageDropPlacementContext = createContext<DropPlacement | null>(null);

/** Properties for the page drag-and-drop boundary. */
export interface PageDragPluginProps {
  /** Page surface whose blocks participate in this drag context. */
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
  /** Recursively rendered child blocks placed below this block's own row. */
  readonly children?: ReactNode;
}

/** Returns whether a block subtree contains a candidate ID. */
function containsBlock(block: EditorBlock, candidateId: string): boolean {
  return block.id === candidateId || block.children.some((child) => containsBlock(child, candidateId));
}

/** Returns the root-to-block path for one block ID. */
function findBlockPath(blocks: EditorBlock[], targetId: string, parents: EditorBlock[] = []): EditorBlock[] | undefined {
  for (const block of blocks) {
    const path = [...parents, block];
    if (block.id === targetId) return path;
    const childPath = findBlockPath(block.children, targetId, path);
    if (childPath) return childPath;
  }
  return undefined;
}

/**
 * Finds the shallowest level reachable at the gap after the path's last block.
 *
 * A block can move outside its parent at the same visible gap only when it is
 * that parent's last child. The check repeats upward so a final descendant can
 * be placed beside any ancestor whose subtree also ends at this gap.
 */
function minimumDropDepth(path: EditorBlock[]): number {
  let depth = path.length - 1;
  while (depth > 0 && path[depth - 1]?.children.at(-1)?.id === path[depth]?.id) depth -= 1;
  return depth;
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
  const path = findBlockPath(blocks, indicatorId);
  if (!path) return null;
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

  const currentDepth = path.length - 1;
  const firstChild = path[currentDepth]!.children[0];
  // The gap below a non-empty parent is the start of its child list. It cannot
  // also mean "after the parent", which would place the block below the entire
  // subtree instead of at the displayed line.
  const pointerDepth = firstChild
    ? currentDepth + 1
    : pointerX !== undefined
    ? currentDepth + Math.trunc((cursorX - event.over.rect.left) / childDropIndent)
    : currentDepth;
  const depth = Math.max(minimumDropDepth(path), Math.min(currentDepth + 1, pointerDepth));
  const asChild = depth > currentDepth;
  return {
    // The gap directly after a parent is before its first child. Only an empty
    // parent uses `inside`, where append and first insertion are equivalent.
    targetId: asChild ? firstChild?.id ?? indicatorId : path[depth]!.id,
    position: asChild ? firstChild ? "before" : "inside" : "after",
    indicatorId,
    indicatorEdge: "after",
    indicatorOffset: (depth - currentDepth) * PAGE_INDENT,
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
    ...block.children.flatMap((child) => flattenPreview(child, depth + 1)),
  ];
}

/**
 * Renders a non-interactive snapshot of one dragged block subtree.
 *
 * The preview uses detached block data instead of PageBlock. Reusing PageBlock
 * here would mount duplicate contenteditable elements and register a second set
 * of draggable and droppable nodes with the same IDs. Stable type attributes
 * let the preview reuse the demo's heading, list, quote, and code presentation.
 */
function PageDragPreview({ block }: { readonly block: EditorBlock }) {
  const entries = flattenPreview(block);
  const hiddenCount = Math.max(0, entries.length - MAX_PREVIEW_BLOCKS);

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
 * Provides demo-owned single-block drag-and-drop behavior for PageSurface.
 *
 * Each successful drop moves only the block whose handle started the drag.
 * Children are not separate move targets: they remain owned by that block and
 * therefore travel with it automatically. A block-body drop appends and uses
 * a highlight. A gap drop uses a horizontal line that follows the pointer
 * across every available depth. The resolved move is expressed relative to
 * the preceding block, one of its final ancestors, or its children. Dropping
 * onto the dragged subtree is ignored to prevent an ownership cycle.
 *
 * After a successful move, the plugin replaces any text, block, or mixed
 * selection with one BlockSelection for the moved block. This is deliberate:
 * dragging is a single-object operation, and retaining a DOM text range across
 * remounted content would leave selection state disconnected from the browser.
 */
export function PageDragPlugin({
  children,
  activationDistance = 4,
  childDropIndent = 24,
  gapDropZone = 8,
}: PageDragPluginProps) {
  const editor = useEditor();
  const [activeId, setActiveId] = useState<string>();
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor),
  );
  const activeBlock = activeId ? editor.getBlock(activeId) : undefined;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(undefined);
    setDropPlacement(null);
    const placement = resolveDropPlacement(event, editor.getBlocks(), childDropIndent, gapDropZone);
    if (!placement) return;

    const movedId = String(event.active.id);
    const { targetId, position } = placement;
    const moved = editor.getBlock(movedId);
    if (!moved || containsBlock(moved, targetId)) return;

    editor.moveBlock(movedId, targetId, position);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [movedId],
        anchorBlockId: movedId,
        focusBlockId: movedId,
      }],
    });
  };

  return (
    <PageDropPlacementContext.Provider value={dropPlacement}>
      <DndContext
        sensors={sensors}
        collisionDetection={pageCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={(event) => setDropPlacement(
          resolveDropPlacement(event, editor.getBlocks(), childDropIndent, gapDropZone),
        )}
        onDragCancel={() => {
          setActiveId(undefined);
          setDropPlacement(null);
        }}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeBlock && (
            <div className="page-drag-overlay" aria-hidden="true">
              <PageDragPreview block={activeBlock} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </PageDropPlacementContext.Provider>
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
export function PageDraggableBlock({ block, selected, content, children }: PageDraggableBlockProps) {
  const draggable = useDraggable({ id: block.id });
  const droppable = useDroppable({ id: block.id });
  const dropPlacement = useContext(PageDropPlacementContext);
  const indicator = dropPlacement?.indicatorId === block.id ? dropPlacement : undefined;

  return (
    <BlockView
      block={block}
      selected={selected}
      className="page-block"
      data-dragging={draggable.isDragging ? "true" : undefined}
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
