/** Minimal recursive shape needed to resolve outline drop positions. */
export interface DropBlock {
  readonly id: string;
  readonly children: DropBlock[];
}

/** Document move target selected for a horizontal level in an after-block gap. */
export interface AfterDropPlacement {
  readonly targetId: string;
  readonly position: "before" | "after" | "inside";
  readonly depth: number;
  readonly depthOffset: number;
}

/** Returns the root-to-block path for one block ID. */
function findBlockPath(blocks: DropBlock[], targetId: string, parents: DropBlock[] = []): DropBlock[] | undefined {
  let found: DropBlock[] | undefined;
  for (const block of blocks) {
    const path = [...parents, block];
    found = block.id === targetId ? path : findBlockPath(block.children, targetId, path);
    if (found) break;
  }
  return found;
}

/** Finds the shallowest structurally valid level at the end of a block path. */
function minimumDropDepth(path: DropBlock[]): number {
  let depth = path.length - 1;
  while (depth > 0 && path[depth - 1]?.children.at(-1)?.id === path[depth]?.id) depth -= 1;
  return depth;
}

/**
 * Resolves an insertion in the gap after a visible block.
 *
 * A non-empty block's lower gap is always the start of its child list. A leaf
 * gap may move horizontally through every level whose subtree ends there.
 *
 * @param blocks - Current detached document tree.
 * @param blockId - Visible block immediately before the gap.
 * @param depthOffset - Requested nesting change relative to that block.
 * @returns Concrete move target, or undefined when the block no longer exists.
 */
export function resolveAfterDropPlacement(
  blocks: DropBlock[],
  blockId: string,
  depthOffset: number,
): AfterDropPlacement | undefined {
  const path = findBlockPath(blocks, blockId);
  if (!path) return undefined;
  const currentDepth = path.length - 1;
  const firstChild = path[currentDepth]!.children[0];
  const requestedDepth = firstChild ? currentDepth + 1 : currentDepth + depthOffset;
  const depth = Math.max(minimumDropDepth(path), Math.min(currentDepth + 1, requestedDepth));
  const asChild = depth > currentDepth;
  return {
    targetId: asChild ? firstChild?.id ?? blockId : path[depth]!.id,
    position: asChild ? firstChild ? "before" : "inside" : "after",
    depth,
    depthOffset: depth - currentDepth,
  };
}
