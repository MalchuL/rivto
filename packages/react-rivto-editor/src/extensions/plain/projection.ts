/**
 * Visible outline of the plain-text projection.
 *
 * The block editor and this projection share one document. Plain mode keeps
 * only configured block types and drops an unsupported block together with
 * everything nested inside it. Indentation then follows that visible outline
 * rather than the previous stored sibling, which may be hidden.
 *
 * @module
 */
import type { EditorBlockNode } from "@chulane/rivto";

/** Read API the projection needs from the shared block manager. */
export interface PlainBlockSource {
  /** @param id - Block identifier. @returns Detached node, or undefined. */
  getBlockNode(id: string): EditorBlockNode | undefined;
  /** @param id - Block identifier. @returns Parent id, null at the root, or undefined. */
  getParentId(id: string): string | null | undefined;
  /** @returns Root block ids in document order. */
  getRootIds(): readonly string[];
  /**
   * Moves sibling roots together.
   *
   * @param ids - Roots that share a parent.
   * @param targetId - Destination anchor.
   * @param position - Placement relative to the anchor.
   */
  moveBlocks(
    ids: string[],
    targetId: string | null,
    position?: "before" | "after" | "inside",
  ): void;
}

/** One visible block in the plain-text outline. */
export interface PlainOutlineNode {
  /** Stable document id shared with the block editor. */
  readonly id: string;
  /** Native block type. */
  readonly type: string;
  /** Persisted plain-text content, including newlines from Shift+Enter. */
  readonly content: string;
  /** Visible nesting depth. Roots are 0. */
  readonly depth: number;
  /** Parent id in the document, or null for a root. */
  readonly parentId: string | null;
  /** Visible descendants in document order. */
  readonly children: readonly PlainOutlineNode[];
}

/**
 * Reports whether a block is shown in the plain projection.
 *
 * A block is visible only when its own type is allowed and every ancestor is
 * allowed. Children of an unsupported block stay hidden even when their type
 * would otherwise be shown.
 *
 * @param source - Shared block reader.
 * @param id - Block to test.
 * @param blockTypes - Types the plain editor is allowed to show.
 * @returns Whether the plain editor renders this block.
 */
export function isPlainBlockVisible(
  source: PlainBlockSource,
  id: string,
  blockTypes: ReadonlySet<string>,
): boolean {
  let current: string | null = id;
  while (current) {
    const node = source.getBlockNode(current);
    if (!node || !blockTypes.has(node.type)) return false;
    const parent = source.getParentId(current);
    if (parent === undefined) return false;
    current = parent;
  }
  return true;
}

/**
 * Projects the document into the outline the plain editor renders.
 *
 * @param source - Shared block reader.
 * @param blockTypes - Types the plain editor is allowed to show.
 * @returns Visible roots and their visible descendants.
 */
export function projectPlainOutline(
  source: PlainBlockSource,
  blockTypes: ReadonlySet<string>,
): readonly PlainOutlineNode[] {
  const visit = (ids: readonly string[], depth: number): PlainOutlineNode[] => {
    const nodes: PlainOutlineNode[] = [];
    for (const id of ids) {
      const node = source.getBlockNode(id);
      if (!node || !blockTypes.has(node.type)) continue;
      const parent = source.getParentId(id);
      nodes.push({
        id,
        type: node.type,
        content: node.content,
        depth,
        parentId: parent ?? null,
        children: visit(node.childIds, depth + 1),
      });
    }
    return nodes;
  };
  return visit(source.getRootIds(), 0);
}

/**
 * Nests blocks under the previous block that the plain editor can see.
 *
 * Core indent always uses the previous stored sibling. In this projection that
 * sibling may be a widget, separator, or other hidden type. The move skips
 * those hidden siblings and parents the range under the previous visible one.
 * Hidden blocks that sit between them stay where they are.
 *
 * @param source - Shared block reader and mover.
 * @param ids - Blocks to indent, including any selected descendants.
 * @param blockTypes - Types the plain editor is allowed to show.
 * @returns Whether a visible parent was found and the move ran.
 */
export function plainIndentBlocks(
  source: PlainBlockSource,
  ids: readonly string[],
  blockTypes: ReadonlySet<string>,
): boolean {
  const visible = ids.filter((id) => isPlainBlockVisible(source, id, blockTypes));
  const roots = topLevelIds(source, visible);
  if (!roots.length) return false;
  const parentId = source.getParentId(roots[0]!);
  if (parentId === undefined) return false;
  if (roots.some((id) => source.getParentId(id) !== parentId)) return false;
  const siblings = siblingIds(source, roots[0]!);
  const ordered = [...roots].sort((left, right) => siblings.indexOf(left) - siblings.indexOf(right));
  const index = siblings.indexOf(ordered[0]!);
  let targetId: string | undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = siblings[cursor];
    if (candidate && isPlainBlockVisible(source, candidate, blockTypes)) {
      targetId = candidate;
      break;
    }
  }
  if (!targetId) return false;
  source.moveBlocks(ordered, targetId, "inside");
  return true;
}

/**
 * Drops ids that are descendants of another id in the same set.
 *
 * @param source - Shared block reader.
 * @param ids - Candidate ids in any order.
 * @returns The outermost selected ids, preserving input order.
 */
function topLevelIds(source: PlainBlockSource, ids: readonly string[]): string[] {
  const selected = new Set(ids);
  return ids.filter((id) => {
    let parent = source.getParentId(id);
    while (parent) {
      if (selected.has(parent)) return false;
      const next = source.getParentId(parent);
      if (next === undefined) return false;
      parent = next;
    }
    return true;
  });
}

/**
 * Reads the sibling list that contains one block.
 *
 * @param source - Shared block reader.
 * @param id - Block whose siblings are required.
 * @returns Ordered sibling ids, or an empty list when the block is missing.
 */
function siblingIds(source: PlainBlockSource, id: string): readonly string[] {
  const parentId = source.getParentId(id);
  if (parentId === undefined) return [];
  if (!parentId) return source.getRootIds();
  return source.getBlockNode(parentId)?.childIds ?? [];
}
