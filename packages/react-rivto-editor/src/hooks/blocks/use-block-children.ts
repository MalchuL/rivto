/**
 * Resolves one block's direct child identifiers and child-list commands.
 *
 * `BlockTree` is the only renderer that walks descendants. This hook supplies
 * the cached ID list those nodes need without materializing recursive `Block`
 * snapshots. Commands resolve the live child list at call time so a stale
 * render cannot mutate another parent.
 *
 * @module
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
  EditorBlock as Block,
  EditorBlockInput as BlockInput,
} from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/** Commands that mutate the direct children of one parent block. */
export interface BlockChildrenOperations {
  /**
   * Adds a child after another direct child.
   *
   * Omitting `afterId` appends the child. Passing `null` inserts it first.
   *
   * @returns The complete new-child subtree.
   */
  add(block: BlockInput, afterId?: string | null): Block;
  /** Removes a direct child and its descendants. */
  remove(childId: string): void;
  /** Moves a direct child after a sibling, or first when `afterId` is null. */
  move(childId: string, afterId: string | null): void;
}

/** Reactive child identifiers and stable commands returned by useBlockChildren. */
export interface UseBlockChildrenResult {
  /** Current direct-child identifiers in persisted sibling order. */
  readonly children: readonly string[];
  /** Memoized commands bound to the requested parent ID. */
  readonly operations: BlockChildrenOperations;
}

/**
 * Resolves the direct child IDs of one block and commands for changing them.
 *
 * Child identifiers come from the cached `getChildIds` snapshot. Operations
 * resolve the parent at call time and only accept its current direct children,
 * so stale rendered IDs cannot mutate another subtree.
 *
 * Adding to a parent with no children uses the editor's existing insert and
 * indent commands. The hook owns no tree state and performs no optimistic
 * updates; validation, transactions, undo, and synchronization remain in the
 * editor runtime.
 *
 * @param blockId - Stable ID of the parent block.
 * @returns Current child identifiers and commands bound to the parent ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockChildren(blockId: string): UseBlockChildrenResult {
  const { reactEditor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.blocks.subscribeBlock(blockId, listener),
    [blockId, reactEditor],
  );
  const getSnapshot = useCallback(
    () => reactEditor.blocks.getChildIds(blockId),
    [blockId, reactEditor],
  );
  const children = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const operations = useMemo<BlockChildrenOperations>(() => {
    const getChildIds = (): readonly string[] => {
      if (!reactEditor.blocks.hasBlock(blockId)) throw new Error(`Block ${blockId} not found`);
      return reactEditor.blocks.getChildIds(blockId);
    };

    const requireChild = (childId: string): void => {
      if (!getChildIds().includes(childId)) {
        throw new Error(`Block ${childId} is not a direct child of ${blockId}`);
      }
    };

    return {
      add: (block, afterId) => {
        const childIds = getChildIds();
        if (afterId !== undefined && afterId !== null) requireChild(afterId);

        let child: Block;
        if (childIds.length === 0) {
          child = reactEditor.blocks.insertBlock(block, blockId);
          reactEditor.blocks.indentBlock(child.id);
        } else if (afterId === null) {
          child = reactEditor.blocks.insertBlock(block, childIds[0]!);
          reactEditor.blocks.moveBlock(child.id, null);
        } else {
          child = reactEditor.blocks.insertBlock(block, afterId ?? childIds.at(-1));
        }
        return child;
      },
      remove: (childId) => {
        requireChild(childId);
        reactEditor.blocks.removeBlock(childId);
      },
      move: (childId, afterId) => {
        requireChild(childId);
        if (afterId !== null) requireChild(afterId);
        reactEditor.blocks.moveBlock(childId, afterId);
      },
    };
  }, [blockId, reactEditor]);

  return {
    children,
    operations,
  };
}
