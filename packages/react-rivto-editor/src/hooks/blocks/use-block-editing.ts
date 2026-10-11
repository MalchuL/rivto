/**
 * Connects block contenteditable elements to React and the core block manager.
 *
 * The hook keeps browser owned text in sync with document updates while
 * preserving live selections. Contentless blocks use useBlockSelectionAnchor.
 *
 * @module
 */
import { useBlockNode, type UseBlockNodeResult } from "./use-block";
import { useBlockTextEditing, type BlockTextEditingAttributes } from "./use-block-text-editing";
import { usePreventTextEditing, type PreventTextEditingAttributes } from "./use-prevent-text-editing";

/**
 * Renderer-facing block state, typed property commands, and text DOM attributes.
 *
 * `block` is the reactive node snapshot from `useBlockNode` and does not include
 * descendants. For callbacks created during an older render, read current values
 * through editorView.blocks.getBlockNode(blockId), not the captured snapshot.
 * Current document content excludes uncommitted DOM edits; undefined denotes an
 * unknown/deleted block, while an empty string denotes an existing textless block.
 */
export interface UseBlockEditingResult<Props extends object = Record<string, unknown>> extends UseBlockNodeResult<Props> {
  /** DOM props for the single collaborative plain-text editable. */
  readonly attributes: BlockTextEditingAttributes;
  /** Props for controls or nested editors that must not activate raw block editing. */
  readonly preventTextEditingAttributes: PreventTextEditingAttributes;
}

/**
 * Connects a text renderer to one block's state, commands, and browser interaction.
 *
 * Composes useBlockNode, useBlockTextEditing, and usePreventTextEditing with one
 * document subscription. Contentless renderers compose useBlockNode with
 * useBlockSelectionAnchor instead, without allocating a text controller.
 *
 * External commands, undo/redo, and remote CRDT updates reconcile into the
 * contenteditable before paint. DOM selection offsets are saved and restored
 * when replacement is necessary, while IME composition owns the DOM until
 * composition end. Do not render the content as React children of the editable.
 *
 * The presence marker explicitly opts the spread region into selection
 * anchoring. Enter/Tab behavior, clipboard policy, block selection, and slash
 * commands remain extension responsibilities. Structural anchors opt into
 * whole-block drag anchoring without creating an editable element.
 *
 * @example
 * ```tsx
 * const editing = useBlockEditing<{ count: number }>(blockId);
 * return (
 *   <div>
 *     <div {...editing.attributes} />
 *     <button onClick={() => editing.operations.setProp("count", 0)}>
 *       Reset count: {editing.block?.props.count ?? 0}
 *     </button>
 *   </div>
 * );
 * ```
 *
 * @param blockId - Stable ID bound to returned methods until the ID or editor changes.
 * @returns Reactive block state, validated property commands, and text DOM attributes.
 * Property writes patch supplied keys without replacing siblings; undefined removes
 * a key when the registered schema permits it. Invalid writes throw without mutation.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockEditing<Props extends object = Record<string, unknown>>(blockId: string): UseBlockEditingResult<Props> {
  const result = useBlockNode<Props>(blockId);
  const attributes = useBlockTextEditing(blockId, result.block?.content);
  const preventTextEditingAttributes = usePreventTextEditing();
  return { ...result, attributes, preventTextEditingAttributes };
}
