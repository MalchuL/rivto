import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
  EditorBlock as Block,
  EditorBlockPatch as BlockPatch,
} from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/** Commands bound to one stable block ID. */
export interface BlockOperations {
  /** Applies any supported mutable block patch through `block.update`. */
  update(patch: BlockPatch): void;
  /** Replaces the block's collaborative plain-text content. */
  setContent(content: string): void;
  /** Converts the block to another registered native type. */
  setType(type: string): void;
  /** Sets or removes one native property without replacing sibling properties. */
  setProp(key: string, value: unknown): void;
  /** Sets or removes data owned by one plugin namespace. */
  setPluginData(pluginId: string, value: unknown): void;
  /** Removes the block subtree. */
  remove(): void;
  /** Appends this block's content and children into a target, then removes it. */
  mergeInto(targetId: string): number;
  /** Moves the block after a sibling, or to the start when passed null. */
  moveAfter(blockId: string | null): void;
  /** Moves the block directly before a sibling. */
  moveBefore(blockId: string): void;
  /** Moves the block to the end of another block's children. */
  moveInside(blockId: string): void;
  /** Nests the block under its previous sibling when the structure allows it. */
  indent(): void;
  /** Outdents the block and adopts siblings that followed it. */
  outdent(): void;
}

/** Reactive block snapshot and stable commands returned by useBlock. */
export interface UseBlockResult {
  /** Current detached block value, or undefined after deletion/for unknown IDs. */
  readonly block: Block | undefined;
  /** Memoized commands permanently bound to the requested block ID. */
  readonly operations: BlockOperations;
}

/**
 * Resolves one block and its bound operations from the current editor.
 *
 * `block` is a stable detached snapshot, not a live or mutable CRDT object.
 * Only changes to this block or its descendants replace its identity. Deletion
 * changes it to undefined. `operations` remains stable until either the editor
 * instance or block ID changes.
 *
 * @param blockId - Stable persisted ID of the block to resolve.
 * @returns Current block snapshot together with commands bound to its ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlock(blockId: string): UseBlockResult {
  const { reactEditor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.blocks.subscribeBlock(blockId, listener),
    [blockId, reactEditor],
  );
  const getSnapshot = useCallback(() => reactEditor.blocks.getBlock(blockId), [blockId, reactEditor]);
  const block = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Commands target the ID rather than the detached snapshot, so they always
  // operate on the latest document state. Memoization keeps their references
  // stable for consumers that pass them into memoized child components.
  const operations = useMemo<BlockOperations>(() => ({
    update: (patch) => reactEditor.blocks.updateBlock(blockId, patch),
    setContent: (content) => reactEditor.blocks.updateBlock(blockId, { content }),
    setType: (type) => reactEditor.blocks.setBlockType(blockId, type),
    setProp: (key, value) => reactEditor.blocks.setBlockProp(blockId, key, value),
    setPluginData: (pluginId, value) => reactEditor.blocks.setBlockPluginData(blockId, pluginId, value),
    remove: () => reactEditor.blocks.removeBlock(blockId),
    mergeInto: (targetId) => reactEditor.blocks.mergeBlocks(targetId, blockId),
    moveAfter: (afterId) => reactEditor.blocks.moveBlock(blockId, afterId),
    moveBefore: (beforeId) => reactEditor.blocks.moveBlock(blockId, beforeId, "before"),
    moveInside: (parentId) => reactEditor.blocks.moveBlock(blockId, parentId, "inside"),
    indent: () => reactEditor.blocks.indentBlock(blockId),
    outdent: () => reactEditor.blocks.outdentBlock(blockId),
  }), [blockId, reactEditor]);

  return {
    block,
    operations,
  };
}
