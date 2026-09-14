/**
 * Canonical page-drag placement independent from core move-command syntax.
 *
 * One sibling gap is represented by its stable neighbors, so approaching the
 * gap from either edge produces the same placement and visual indicator. Core
 * `before | after | inside` syntax is derived only when the move is committed.
 *
 * @module
 */
import type { BlockDropPlacementOptions } from "../../../../../views/types";
import type {
  BetweenDropPlacement,
  CanonicalDropPlacement,
  DropBlock,
  DropBlockLocation,
  DropMoveTarget,
  InsideDropPlacement,
  ResolvedDropPlacementOptions,
} from "./types";

export type {
  BetweenDropPlacement,
  CanonicalDropPlacement,
  DropBlock,
  DropBlockLocation,
  DropMoveTarget,
  InsideDropPlacement,
  ResolvedDropPlacementOptions,
} from "./types";

/**
 * Builds the destination tree seen after the currently moved roots are removed.
 *
 * @param blocks - Frozen document tree captured when dragging starts.
 * @param rootIds - Moved subtree roots omitted from destination gaps.
 * @returns Minimal placement tree without those subtrees.
 */
export function excludeDropSubtrees(
  blocks: readonly DropBlock[],
  rootIds: ReadonlySet<string>,
): DropBlock[] {
  return blocks.flatMap((block) => rootIds.has(block.id) ? [] : [{
    id: block.id,
    children: excludeDropSubtrees(block.children, rootIds),
  }]);
}

/**
 * Applies one block view's placement overrides to provider defaults.
 *
 * @param childDropIndent - Global pixels per requested child depth.
 * @param gapDropZone - Global item-edge zone for sibling placement.
 * @param override - Target or parent view overrides.
 * @param allowChildPlacement - Global child-placement policy.
 * @returns Positive, safe values consumed by pointer geometry.
 */
export function resolveBlockDropPlacementOptions(
  childDropIndent: number,
  gapDropZone: number,
  override?: BlockDropPlacementOptions,
  allowChildPlacement: boolean = true,
): ResolvedDropPlacementOptions {
  return {
    allowChildPlacement: override?.allowChildPlacement ?? allowChildPlacement,
    childDropIndent: Math.max(1, override?.childDropIndent ?? childDropIndent),
    gapDropZone: Math.max(0, override?.gapDropZone ?? gapDropZone),
  };
}

/**
 * Finds a block and its structural location.
 *
 * @param blocks - Sibling list currently being searched.
 * @param targetId - Block identifier to locate.
 * @param parentId - Owner of the current sibling list.
 * @param path - Ancestors collected before the current list.
 * @returns Structural location, or `undefined` when absent.
 */
function findBlockLocation(
  blocks: readonly DropBlock[],
  targetId: string,
  parentId: string | null = null,
  path: readonly DropBlock[] = [],
): DropBlockLocation | undefined {
  let result: DropBlockLocation | undefined;
  for (const block of blocks) {
    const blockPath = [...path, block];
    result = block.id === targetId
      ? { block, siblings: blocks, parentId, depth: path.length, path: blockPath }
      : findBlockLocation(block.children, targetId, block.id, blockPath);
    if (result) break;
  }
  return result;
}

/**
 * Builds the gap immediately before one block.
 *
 * @param blocks - Complete document forest.
 * @param blockId - Block immediately after the gap.
 * @returns Canonical gap, or `undefined` when the block is absent.
 */
export function resolveBeforeDropPlacement(
  blocks: readonly DropBlock[],
  blockId: string,
): BetweenDropPlacement | undefined {
  const location = findBlockLocation(blocks, blockId);
  if (!location) return undefined;
  const index = location.siblings.indexOf(location.block);
  return {
    kind: "between",
    parentId: location.parentId,
    previousId: location.siblings[index - 1]?.id ?? null,
    nextId: blockId,
    depth: location.depth,
  };
}

/**
 * Builds the gap immediately after one block without changing outline depth.
 *
 * @param blocks - Complete document forest.
 * @param blockId - Block immediately before the gap.
 * @returns Canonical sibling gap, or `undefined` when the block is absent.
 */
export function resolveSiblingAfterDropPlacement(
  blocks: readonly DropBlock[],
  blockId: string,
): BetweenDropPlacement | undefined {
  const location = findBlockLocation(blocks, blockId);
  if (!location) return undefined;
  const index = location.siblings.indexOf(location.block);
  return {
    kind: "between",
    parentId: location.parentId,
    previousId: blockId,
    nextId: location.siblings[index + 1]?.id ?? null,
    depth: location.depth,
  };
}

/**
 * Finds the shallowest structurally valid level at the end of a block path.
 *
 * @param path - Root-to-block path ending immediately before the requested gap.
 * @returns Minimum depth reachable without crossing a later sibling.
 */
function minimumDropDepth(path: readonly DropBlock[]): number {
  let depth = path.length - 1;
  while (depth > 0 && path[depth - 1]?.children.at(-1)?.id === path[depth]?.id) depth -= 1;
  return depth;
}

/**
 * Resolves the gap after a visible block at a requested outline depth.
 *
 * A non-empty block's lower gap is the start of its child list. A leaf gap may
 * move horizontally through every ancestor level whose subtree ends there.
 *
 * @param blocks - Complete document forest.
 * @param blockId - Visible block immediately before the pointer gap.
 * @param depthOffset - Requested nesting change relative to that block.
 * @returns Canonical gap, or `undefined` when the block is absent.
 */
export function resolveAfterDropPlacement(
  blocks: readonly DropBlock[],
  blockId: string,
  depthOffset: number,
): BetweenDropPlacement | undefined {
  const location = findBlockLocation(blocks, blockId);
  if (!location) return undefined;
  const currentDepth = location.depth;
  const firstChild = location.block.children[0];
  const requestedDepth = firstChild ? currentDepth + 1 : currentDepth + depthOffset;
  const depth = Math.max(minimumDropDepth(location.path), Math.min(currentDepth + 1, requestedDepth));
  if (depth > currentDepth) {
    return {
      kind: "between",
      parentId: blockId,
      previousId: null,
      nextId: firstChild?.id ?? null,
      depth,
    };
  }
  const parent = depth > 0 ? location.path[depth - 1]! : undefined;
  const siblings = parent?.children ?? blocks;
  const previous = location.path[depth]!;
  const index = siblings.indexOf(previous);
  return {
    kind: "between",
    parentId: parent?.id ?? null,
    previousId: previous.id,
    nextId: siblings[index + 1]?.id ?? null,
    depth,
  };
}

/**
 * Creates a child-append placement for a highlighted block body.
 *
 * @param parentId - Block that will own the moved roots.
 * @returns Canonical inside placement.
 */
export function resolveInsideDropPlacement(parentId: string): InsideDropPlacement {
  return { kind: "inside", parentId };
}

/**
 * Translates semantic React placement into the existing core move command.
 *
 * The next sibling is preferred because it remains stable when moved roots are
 * removed. End and empty-list gaps fall back to the previous sibling or parent.
 *
 * @param placement - Canonical between or inside placement.
 * @returns Target and relationship accepted by core and cross-document moves.
 */
export function dropMoveTarget(placement: CanonicalDropPlacement): DropMoveTarget {
  if (placement.kind === "inside") return { targetId: placement.parentId, position: "inside" };
  if (placement.nextId) return { targetId: placement.nextId, position: "before" };
  if (placement.previousId) return { targetId: placement.previousId, position: "after" };
  return placement.parentId
    ? { targetId: placement.parentId, position: "inside" }
    : { targetId: null, position: "after" };
}
