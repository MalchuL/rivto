import type { EditorViewApi } from "../../editor-view/types";
import { TODO_ITEM_BLOCK_TYPE, nextStatus, nextTimestamp, todoItemPropsSchema, type TodoItemPropertiesPatch, type TodoItemStatus } from "./todo-item-model";

/** ID-bound TODO operations; every action reads current document state. */
export class TodoItemActions {
  /**
   * @param editorView - Editor view containing the current block.
   * @param blockId - Stable TODO block identity.
   */
  constructor(private readonly editorView: EditorViewApi, private readonly blockId: string) {}

  /** Runs a native input/composition commit and timestamp update in one undo batch. */
  commitText(commit: () => void): void {
    const block = this.editorView.runtime.blocks.getBlockNode(this.blockId);
    if (!block) return;
    const updatedAt = nextTimestamp(String(block.props.updatedAt));
    this.editorView.runtime.history.batchUpdates(() => {
      commit();
      this.editorView.runtime.blocks.updateBlock(this.blockId, { props: { updatedAt } });
    });
  }

  /** Cycles workflow state and its timestamp atomically through the validated dialog path. */
  cycleStatus = (): void => {
    const block = this.editorView.runtime.blocks.getBlockNode(this.blockId);
    if (block) this.commitProperties({ status: nextStatus(block.props.status as TodoItemStatus) });
  };

  /**
   * Commits a validated modal patch and owns updatedAt generation.
   * Inline property edits use the same validated modal path.
   * @param patch - Optional host, default-modal, or inline patch.
   * @returns Whether a changed, valid patch was written.
   */
  commitProperties = (patch?: TodoItemPropertiesPatch): boolean => {
    const block = this.editorView.runtime.blocks.getBlockNode(this.blockId);
    if (!block || block.type !== TODO_ITEM_BLOCK_TYPE || !patch) return false;
    const changed = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => block.props[key] !== value),
    );
    if (!Object.keys(changed).length) return false;
    const updatedAt = nextTimestamp(String(block.props.updatedAt));
    const result = todoItemPropsSchema.loose().safeParse({ ...block.props, ...changed, updatedAt });
    if (!result.success) return false;
    this.editorView.runtime.history.batchUpdates(() => {
      this.editorView.runtime.blocks.updateBlock(this.blockId, { props: { ...changed, updatedAt } });
    });
    return true;
  };
}
