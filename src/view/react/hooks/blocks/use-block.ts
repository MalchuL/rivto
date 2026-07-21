import { useMemo } from "react";
import type {
  EditorBlock,
  EditorBlockLayout,
  EditorBlockPatch,
} from "../../../../editor";
import { useEditorContext } from "../../editor-context";

/** Commands bound to one stable block ID. */
export interface BlockOperations {
  /** Applies any supported mutable block patch through `block.update`. */
  update(patch: EditorBlockPatch): void;
  /** Replaces the block's collaborative plain-text content. */
  setContent(content: string): void;
  /** Converts the block to another registered native type. */
  setType(type: string): void;
  /** Sets or removes one native property without replacing sibling properties. */
  setProp(key: string, value: unknown): void;
  /** Collapses or expands this block's children when the block can be folded. */
  setCollapsed(collapsed: boolean): void;
  /** Toggles the latest persisted collapse state instead of a rendered snapshot. */
  toggleCollapsed(): void;
  /** Sets or removes data owned by one plugin namespace. */
  setPluginData(pluginId: string, value: unknown): void;
  /** Patches collaborative canvas geometry without replacing omitted fields. */
  setLayout(layout: Partial<EditorBlockLayout>): void;
  /** Removes the block subtree and links touching removed descendants. */
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

/** Reactive derived values for one block snapshot. */
export interface BlockGetters {
  /** Whether the block's children are currently persisted as collapsed. */
  readonly collapsed: boolean;
}

/** Reactive block snapshot and stable commands returned by useBlock. */
export interface UseBlockResult {
  /** Current detached block value, or undefined after deletion/for unknown IDs. */
  readonly block: EditorBlock | undefined;
  /** Derived values recomputed whenever the editor revision changes. */
  readonly getters: BlockGetters;
  /** Memoized commands permanently bound to the requested block ID. */
  readonly operations: BlockOperations;
}

/**
 * Resolves one block and its bound operations from the current editor.
 *
 * `block` is a detached snapshot, not a live or mutable CRDT object. Document
 * changes increment the EditorView revision and cause that snapshot to be
 * resolved again; deletion changes it to undefined. `getters` contains values
 * derived from that render's current editor revision, while `operations`
 * remains stable until either the editor instance or block ID changes.
 *
 * @param blockId - Stable persisted ID of the block to resolve.
 * @returns Current block snapshot together with commands bound to its ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlock(blockId: string): UseBlockResult {
  const { editor } = useEditorContext();
  // Commands target the ID rather than the detached snapshot, so they always
  // operate on the latest document state. Memoization keeps their references
  // stable for consumers that pass them into memoized child components.
  const operations = useMemo<BlockOperations>(() => ({
    update: (patch) => editor.updateBlock(blockId, patch),
    setContent: (content) => editor.updateBlock(blockId, { content }),
    setType: (type) => editor.setBlockType(blockId, type),
    setProp: (key, value) => editor.setBlockProp(blockId, key, value),
    setCollapsed: (collapsed) => editor.setBlockCollapsed(blockId, collapsed),
    toggleCollapsed: () => {
      if (editor.getBlock(blockId)) editor.setBlockCollapsed(blockId, !editor.getBlockCollapsed(blockId));
    },
    setPluginData: (pluginId, value) => editor.setBlockPluginData(blockId, pluginId, value),
    setLayout: (layout) => editor.setBlockLayout(blockId, layout),
    remove: () => editor.removeBlock(blockId),
    mergeInto: (targetId) => editor.mergeBlocks(targetId, blockId),
    moveAfter: (afterId) => editor.moveBlock(blockId, afterId),
    moveBefore: (beforeId) => editor.moveBlock(blockId, beforeId, "before"),
    moveInside: (parentId) => editor.moveBlock(blockId, parentId, "inside"),
    indent: () => editor.indentBlock(blockId),
    outdent: () => editor.outdentBlock(blockId),
  }), [blockId, editor]);

  return {
    block: editor.getBlock(blockId),
    getters: { collapsed: editor.getBlockCollapsed(blockId) },
    operations,
  };
}
