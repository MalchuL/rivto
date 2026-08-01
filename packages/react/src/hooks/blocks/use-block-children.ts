import { useMemo } from "react";
import type {
  EditorBlock as Block,
  EditorBlockInput as BlockInput,
} from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

// Reuse one immutable-by-contract empty value so a missing/leaf block does not
// create a new array identity on every render.
const NO_CHILDREN: readonly Block[] = [];

/** Commands that mutate the direct children of one parent block. */
export interface BlockChildrenOperations {
  /**
   * Adds a child after another direct child.
   *
   * Omitting `afterId` appends the child. Passing `null` inserts it first.
   *
   * @returns The new child's stable block ID.
   */
  add(block: BlockInput, afterId?: string | null): string;
  /** Removes a direct child and its descendants. */
  remove(childId: string): void;
  /** Moves a direct child after a sibling, or first when `afterId` is null. */
  move(childId: string, afterId: string | null): void;
}

/** Reactive child snapshots and stable commands returned by useBlockChildren. */
export interface UseBlockChildrenResult {
  /** Current direct children in persisted sibling order. */
  readonly children: readonly Block[];
  /** Memoized commands bound to the requested parent ID. */
  readonly operations: BlockChildrenOperations;
}

/**
 * Resolves the direct children of one block and commands for changing them.
 *
 * Child values are detached snapshots and resolve again when EditorView receives
 * the core editor's global revision. Operations resolve the parent at call time and only accept its
 * current direct children, so stale rendered IDs cannot mutate another subtree.
 *
 * Adding to a parent with no children uses the editor's existing insert and
 * indent commands. The hook owns no tree state and performs no optimistic
 * updates; validation, transactions, undo, and synchronization remain in the
 * editor runtime.
 *
 * @param blockId - Stable ID of the parent block.
 * @returns Current child snapshots and commands bound to the parent ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockChildren(blockId: string): UseBlockChildrenResult {
  const { editor } = useEditorContext();
  const parent = editor.getBlock(blockId);

  const operations = useMemo<BlockChildrenOperations>(() => {
    const getChildren = (): Block[] => {
      const currentParent = editor.getBlock(blockId);
      if (!currentParent) throw new Error(`Block ${blockId} not found`);
      return currentParent.children;
    };

    const requireChild = (childId: string): void => {
      if (!getChildren().some((child) => child.id === childId)) {
        throw new Error(`Block ${childId} is not a direct child of ${blockId}`);
      }
    };

    return {
      add: (block, afterId) => {
        const children = getChildren();
        if (afterId !== undefined && afterId !== null) requireChild(afterId);

        if (children.length === 0) {
          const childId = editor.insertBlock(block, blockId);
          editor.indentBlock(childId);
          return childId;
        }

        if (afterId === null) {
          const childId = editor.insertBlock(block, children[0].id);
          editor.moveBlock(childId, null);
          return childId;
        }

        return editor.insertBlock(block, afterId ?? children.at(-1)?.id);
      },
      remove: (childId) => {
        requireChild(childId);
        editor.removeBlock(childId);
      },
      move: (childId, afterId) => {
        requireChild(childId);
        if (afterId !== null) requireChild(afterId);
        editor.moveBlock(childId, afterId);
      },
    };
  }, [blockId, editor]);

  return {
    children: parent?.children ?? NO_CHILDREN,
    operations,
  };
}
