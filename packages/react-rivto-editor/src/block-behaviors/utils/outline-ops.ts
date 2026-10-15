import type { BlockDestination } from "@chulane/document-model";
/**
 * Outline primitives used by block behaviors.
 *
 * Behaviors call these instead of internal document storage so indent, outdent, and child
 * insertion share one implementation. React definition metadata applies
 * interaction policy before generic core commands run.
 *
 * @module
 */
import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import { getBlockContainment } from "../../managers/blocks/types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param reactPanel - Editor view owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(reactPanel: ReactPanelApi, id: string) {
  const parentId = reactPanel.blocks.getParentId(id);
  const parentType = parentId ? reactPanel.blocks.getBlockNode(parentId)?.type : undefined;
  return parentType
    ? getBlockContainment(reactPanel.editor.blockTypes.getDefinition(parentType))
    : undefined;
}

/**
 * Reads selected roots in document order, excluding descendants of another selected root.
 * @param reactPanel - Panel owning the current tree.
 * @param ids - Selected identifiers, possibly unordered or including descendants.
 * @returns Existing top-level roots; single-block requests avoid an outline traversal.
 */
function moveRoots(reactPanel: ReactPanelApi, ids: readonly string[]): string[] {
  if (ids.length <= 1) {
    return ids.filter((id) => reactPanel.blocks.getBlockNode(id));
  }
  const selected = new Set(ids);
  return reactPanel.blocks.getOrderedIds(ids).filter((id) => {
    if (!selected.has(id)) {
      return false;
    }
    let parent = reactPanel.blocks.getParentId(id);
    while (parent != null) {
      if (selected.has(parent)) {
        return false;
      }
      parent = reactPanel.blocks.getParentId(parent);
    }
    return true;
  });
}

/**
 * Checks move permissions using shallow source fields rather than recursive subtree reads.
 * @param reactPanel - Panel owning semantic behavior checks.
 * @param ids - Existing moved-root identifiers.
 * @param destination - Core insertion position.
 * @returns Whether every root exists and all applicable behaviors allow the move.
 */
function canMoveRoots(
  reactPanel: ReactPanelApi,
  ids: readonly string[],
  destination: BlockDestination,
): boolean {
  const sources = ids.flatMap((id) => {
    const node = reactPanel.blocks.getBlockNode(id);
    return node ? [node] : [];
  });
  return (
    sources.length === ids.length &&
    reactPanel.editor.blockBehaviors.canMove({ sources, destination })
  );
}

/**
 * Nests consecutive outline roots under their previous sibling.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to indent together.
 * @returns Nothing; an ineligible range is unchanged.
 */
export function indentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  if (
    !ids.length ||
    ids.some((id) => !reactPanel.blocks.canRemove(id)) ||
    parentContainment(reactPanel, ids[0]!)?.childOutline === "fixed"
  ) {
    return;
  }
  const roots = moveRoots(reactPanel, ids);
  const first = roots[0];
  if (!first) {
    return;
  }
  const parentId = reactPanel.blocks.getParentId(first) ?? null;
  const siblings =
    parentId === null ? reactPanel.blocks.getRootIds() : reactPanel.blocks.getChildIds(parentId);
  const previous = siblings[siblings.indexOf(first) - 1];
  if (!previous || !canMoveRoots(reactPanel, roots, { parentId: previous })) {
    return;
  }
  reactPanel.blocks.indentBlocks([...ids]);
}

/**
 * Lifts consecutive outline roots to their grandparent.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to outdent together.
 * @returns Nothing; root blocks and children of parents with outlineFloor or
 * childOutline: "fixed" remain unchanged.
 */
export function outdentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  if (!ids.length || ids.some((id) => !reactPanel.blocks.canOutdent(id))) {
    return;
  }
  const containment = parentContainment(reactPanel, ids[0]!);
  if (containment?.childOutline === "fixed" || containment?.outlineFloor) {
    return;
  }
  const roots = moveRoots(reactPanel, ids);
  const parentId = roots[0] ? reactPanel.blocks.getParentId(roots[0]) : null;
  if (parentId === null) {
    return;
  }
  const destination = reactPanel.document.blocks.getInsertionDestinationAfter(parentId);
  const boundary = roots.findIndex(
    (id) => reactPanel.blocks.getParentId(id) === destination.parentId,
  );
  const moving = boundary < 0 ? roots : roots.slice(0, boundary);
  if (!moving.length || !canMoveRoots(reactPanel, moving, destination)) {
    return;
  }
  const last = moving.at(-1)!;
  const siblings = reactPanel.blocks.getChildIds(reactPanel.blocks.getParentId(last)!);
  const tail = siblings.slice(siblings.indexOf(last) + 1);
  // Core outdent adopts later siblings before lifting; preflight both moves before any mutation.
  if (tail.length && !canMoveRoots(reactPanel, tail, { parentId: last })) {
    return;
  }
  reactPanel.blocks.outdentBlocks([...ids]);
}

/**
 * Outdents one block until it reaches the document root or its parent forbids outdenting.
 *
 * The loop must stop when outdentBlocks() leaves the parent unchanged. A parent
 * with outlineFloor or fixed children can refuse the move; retrying would loop forever.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param id - Nested block to lift.
 * @returns Nothing; the block stays at the last successful depth.
 */
export function outdentUntilBoundary(reactPanel: ReactPanelApi, id: string): void {
  let parentId = reactPanel.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(reactPanel, [id]);
    const next = reactPanel.blocks.getParentId(id);
    if (next === parentId) {
      break;
    }
    parentId = next;
  }
}

/**
 * Inserts a default writing block as the last child of a container.
 *
 * Insertion validates the local parent and creates the block directly inside the container.
 * No temporary document-root placement is observable during creation.
 * The same history batch expands the parent and sets model selection to the new
 * child at offset zero. The caller schedules DOM focus after rendering.
 *
 * @param reactPanel - Editor view providing writing factories and selection.
 * @param parentId - Container that receives the new child.
 * @returns Complete inserted writing block.
 */
export function appendWritingBlock(reactPanel: ReactPanelApi, parentId: string): EditorBlock {
  let child: EditorBlock | undefined;
  reactPanel.batchUpdates(() => {
    reactPanel.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    child = reactPanel.blocks.insertBlock(
      reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock(),
      { parentId },
    );
    reactPanel.selection.set(createCaretSelection(child.id, 0));
  });
  return child!;
}

/**
 * Converts a leaf block in place and attaches a container's initial children.
 *
 * The root keeps its identity and dormant text, matching ordinary slash type
 * conversion. A temporary valid subtree supplies restricted structural children
 * before the temporary parent block is removed in the same history batch.
 *
 * @param reactPanel - Editor view owning block definitions and mutations.
 * @param blockId - Existing leaf block whose native type changes.
 * @param input - Destination container input supplying its type and children.
 * @returns Nothing; missing or non-leaf blocks remain unchanged.
 */
export function convertLeafToContainer(
  reactPanel: ReactPanelApi,
  blockId: string,
  input: EditorBlockInput,
): void {
  const block = reactPanel.blocks.getBlockNode(blockId);
  if (!block || reactPanel.blocks.hasChildren(blockId)) {
    return;
  }
  reactPanel.batchUpdates(() => {
    const destination = reactPanel.blocks.canRemove(blockId)
      ? reactPanel.blocks.getInsertionDestinationAfter(blockId)
      : { parentId: blockId };
    const templateId = reactPanel.blocks.insertBlock(input, destination).id;
    const childIds = reactPanel.blocks.getBlockNode(templateId)?.childIds ?? [];
    reactPanel.blocks.setBlockType(blockId, input.type);
    if (childIds.length) {
      reactPanel.blocks.moveBlocks([...childIds], blockId, "inside");
    }
    reactPanel.blocks.removeBlock(templateId);
  });
}
