/**
 * Resolves recursive or node block snapshots and ID-bound commands.
 *
 * Use the node hook for ordinary renderers and the full hook when a consumer
 * needs materialized descendants.
 *
 * @module
 */
import type {
  EditorBlock as Block,
  EditorBlockNode as BlockNode,
  EditorBlockPatch as BlockPatch,
} from "@chulane/rivto";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEditorView } from "../../editor-view/use-editor-view";

/** Commands bound to one stable block ID. */
export interface BlockOperations<Props extends object = Record<string, unknown>> {
  /** Applies any supported mutable block patch through `block.update`. */
  update(patch: BlockPatch): void;
  /** Replaces the block's collaborative plain-text content. */
  setContent(content: string): void;
  /** Converts the block to another registered native type. */
  setType(type: string): void;
  /** Validates and patches multiple native properties without replacing others. */
  setProps(props: Partial<Props>): void;
  /** Validates and sets one native property; undefined removes that key without replacing siblings. */
  setProp<Key extends keyof Props>(key: Key, value: Props[Key] | undefined): void;
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

/** Reactive complete block snapshot and stable commands returned by useBlock. */
export interface UseBlockResult {
  /** Current detached subtree, or undefined after deletion/for unknown IDs. */
  readonly block: Block | undefined;
  /** Memoized commands permanently bound to the requested block ID. */
  readonly operations: BlockOperations;
}

/** Node properties use the renderer's declared schema; the generic does not validate reads. */
export type TypedBlockNode<Props extends object> = Omit<BlockNode, "props"> & { readonly props: Readonly<Props> };

/** Reactive node snapshot and stable commands returned by useBlockNode. */
export interface UseBlockNodeResult<Props extends object = Record<string, unknown>> {
  /** Current own fields and direct child IDs, or undefined after deletion. */
  readonly block: TypedBlockNode<Props> | undefined;
  /** Memoized commands permanently bound to the requested block ID. */
  readonly operations: BlockOperations<Props>;
}

/**
 * Creates stable ID-bound commands without subscribing to document values.
 * Uses the active editor runtime from the surrounding EditorView.
 * @param blockId - Stable block ID.
 * @returns Commands that read current document state when invoked. Property writes
 * validate through the registered block definition; invalid writes throw without mutation.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockOperations<Props extends object = Record<string, unknown>>(blockId: string): BlockOperations<Props> {
  const editorView = useEditorView();
  return useMemo<BlockOperations<Props>>(() => ({
    update: (patch) => editorView.runtime.blocks.updateBlock(blockId, patch),
    setContent: (content) => editorView.runtime.blocks.updateBlock(blockId, { content }),
    setType: (type) => editorView.runtime.blocks.setBlockType(blockId, type),
    setProps: (props) => editorView.runtime.blocks.updateBlock(blockId, { props: props as Record<string, unknown> }),
    setProp: (key, value) => editorView.runtime.blocks.setBlockProp(blockId, String(key), value),
    setPluginData: (pluginId, value) => editorView.runtime.blocks.setBlockPluginData(blockId, pluginId, value),
    remove: () => editorView.runtime.blocks.removeBlock(blockId),
    mergeInto: (targetId) => editorView.runtime.blocks.mergeBlocks(targetId, blockId),
    moveAfter: (afterId) => editorView.runtime.blocks.moveBlock(blockId, afterId),
    moveBefore: (beforeId) => editorView.runtime.blocks.moveBlock(blockId, beforeId, "before"),
    moveInside: (parentId) => editorView.runtime.blocks.moveBlock(blockId, parentId, "inside"),
    indent: () => editorView.runtime.blocks.indentBlock(blockId),
    outdent: () => editorView.runtime.blocks.outdentBlock(blockId),
  }), [blockId, editorView]);
}

/**
 * Resolves a complete reactive block subtree and its bound operations.
 *
 * @param blockId - Stable persisted ID of the block to resolve.
 * @returns Current recursive snapshot and commands bound to its ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlock(blockId: string): UseBlockResult {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.runtime.blocks.subscribeBlock(blockId, listener),
    [blockId, editorView],
  );
  const getSnapshot = useCallback(
    () => editorView.runtime.blocks.getBlock(blockId),
    [blockId, editorView],
  );
  const block = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { block, operations: useBlockOperations(blockId) };
}

/**
 * Resolves one block's own fields and direct child IDs without descendants.
 * @param blockId - Stable persisted ID of the block to resolve.
 * @returns Current node snapshot and commands bound to its ID.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockNode<Props extends object = Record<string, unknown>>(blockId: string): UseBlockNodeResult<Props> {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.runtime.blocks.subscribeBlockNode(blockId, listener),
    [blockId, editorView],
  );
  const getSnapshot = useCallback(
    () => editorView.runtime.blocks.getBlockNode(blockId),
    [blockId, editorView],
  );
  const block = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { block: block as TypedBlockNode<Props> | undefined, operations: useBlockOperations<Props>(blockId) };
}
