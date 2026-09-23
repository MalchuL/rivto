/**
 * Read-only preview rendering for page block drag gestures. The preview uses
 * detached snapshots so it never duplicates editable BlockTree instances.
 *
 * @module
 */
import type { EditorBlock as Block } from "@chulane/rivto";
import type { PreviewEntry } from "../types";

/** Maximum number of block rows rendered inside the floating preview. */
const MAX_PREVIEW_BLOCKS = 4;
const PAGE_DRAG_PREVIEW_BLOCK_CLASS = "page-drag-preview-block";
const PAGE_DRAG_PREVIEW_CONTENT_CLASS = "page-block-content";
const PAGE_DRAG_PREVIEW_MORE_CLASS = "page-drag-preview-more";

/**
 * Flattens one subtree in visible page order while retaining relative depth.
 *
 * @param block - Root snapshot to flatten.
 * @param collapseActive - Whether collapsed descendants stay hidden.
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
 * Renders a capped, non-interactive snapshot of dragged block subtrees.
 *
 * @param props - Detached roots and active collapse behavior.
 * @returns Visible preview rows plus an omitted-block count.
 */
export function PageDragPreview({
  blocks,
  collapseActive,
}: {
  readonly blocks: Block[];
  readonly collapseActive: boolean;
}) {
  const entries = blocks.flatMap((block) => flattenPreview(block, collapseActive));
  const hiddenCount = Math.max(
    0,
    blocks.reduce((total, block) => total + subtreeSize(block), 0) - Math.min(entries.length, MAX_PREVIEW_BLOCKS),
  );

  return (
    <>
      {entries.slice(0, MAX_PREVIEW_BLOCKS).map(({ block, depth }) => (
        <div key={block.id} className={`${PAGE_DRAG_PREVIEW_BLOCK_CLASS} my-1`} style={{ marginLeft: depth * 20 }}>
          <div className={PAGE_DRAG_PREVIEW_CONTENT_CLASS}>{block.content || block.type}</div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className={`${PAGE_DRAG_PREVIEW_MORE_CLASS} mt-2 text-sm text-muted-foreground`}>
          … and {hiddenCount} more block{hiddenCount === 1 ? "" : "s"}
        </div>
      )}
    </>
  );
}
