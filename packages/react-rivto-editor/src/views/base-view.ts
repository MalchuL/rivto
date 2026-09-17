/**
 * Generic outline behavior shared by every unregistered or unconstrained block.
 *
 * This class holds the page Enter/Tab/Backspace/Delete semantics previously
 * registered by the focused modules under `extensions/built-ins/page`. Container views override individual methods
 * and return `"default"` to reuse this implementation. The DOM shell component
 * `blocks/block-view.tsx` is unrelated presentation.
 *
 * @module
 */
import {
  findNextEditableBlock,
  findParentBlock,
  findPreviousEditableBlock,
  findRenderedBlock,
} from "../managers";
import type { KeyboardSelectionTarget } from "../managers";
import { navigationDomRoot } from "../extensions/built-ins/page/navigation/utils/scope";
import { removeEmptyBlockAfterStructuralPredecessor } from "../extensions/built-ins/page/block-merge/utils";
import { focusBlockLater, focusCaret } from "./ops/focus-ops";
import { indentBlocks, outdentBlocks, outdentUntilBoundary } from "./ops/outline-ops";
import { convertEmptyToList, mergeBlocks, resetToWritingType, splitBlockAt } from "./ops/text-ops";
import type {
  BlockViewBehavior,
  BlockViewContext,
  BlockViewDropContext,
  BlockViewOutcome,
  DropAxis,
} from "./types";

/**
 * Default block view used when a type registers no specialized behavior.
 *
 * Instances are stateless. {@link ViewManager} keeps one shared fallback.
 */
export class BaseBlockView implements BlockViewBehavior {
  /** Sibling-sort axis this type owns, if any. */
  readonly dropAxis?: DropAxis;
  /** Whether the complete BlockView is a drop target, including empty lanes. */
  readonly acceptsDropContainer: boolean = false;

  /**
   * Splits at the caret, continues a list, or lifts an empty nested block.
   *
   * @param context - Block that owns the Enter event.
   * @param target - Caret or structural keyboard target.
   * @returns `"handled"` when a block was created or outdented.
   */
  onSplit(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome {
    const { reactEditor, block, root } = context;
    const { isEmptyBlock } = reactEditor;
    const editor = reactEditor;
    if (isEmptyBlock(block) && editor.blocks.getParentId(block.id)) {
      outdentUntilBoundary(reactEditor, block.id);
      focusCaret(reactEditor, root, block.id, 0);
      return "handled";
    }
    const listActive = reactEditor.blocks.hasListProps("list");
    const collapseActive = reactEditor.blocks.hasListProps("collapse");
    if (listActive && isEmptyBlock(block) && block.listProps.type !== "list") {
      convertEmptyToList(reactEditor, block.id);
      focusBlockLater(root, block.id, 0);
      return "handled";
    }
    const splitAt = target.collapsed
      ? Math.min(target.offset ?? 0, block.content.length)
      : block.content.length;
    const nextBlockId = splitBlockAt(reactEditor, block, splitAt);
    if (block.children.length > 0 && (!collapseActive || block.listProps.collapsed !== true)) {
      // Insertion created a sibling. Indent then prepend so Enter places the
      // new writing block as the first visible child.
      editor.blocks.indentBlock(nextBlockId);
      editor.blocks.moveBlock(nextBlockId, null);
    } else if (editor.mode.get() === "edgeless" && editor.blocks.getParentId(block.id) === null) {
      const element = editor.elements.getElements().find((candidate) =>
        candidate.type === "block" && candidate.props.endBlockId === block.id,
      );
      if (element) editor.elements.updateElement(element.id, { props: { endBlockId: nextBlockId } });
    }
    focusBlockLater(root, nextBlockId, 0);
    return "handled";
  }

  /**
   * Indents the supplied outline roots through the core command.
   *
   * @param context - First selected block, used only for the editor handle.
   * @param ids - Identifiers to indent together.
   * @returns `"handled"` after the command runs, including containment no-ops.
   */
  onIndent(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome {
    indentBlocks(context.reactEditor, ids);
    return "handled";
  }

  /**
   * Outdents the supplied outline roots through the core command.
   *
   * @param context - First selected block, used only for the editor handle.
   * @param ids - Identifiers to outdent together.
   * @returns `"handled"` after the command runs, including floor no-ops.
   */
  onOutdent(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome {
    outdentBlocks(context.reactEditor, ids);
    return "handled";
  }

  /**
   * Outdents a nested block at a collapsed start caret.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the block is nested, otherwise `"default"`.
   */
  onOutdentAtStart(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome {
    const rendered = findRenderedBlock(context.root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) return "default";
    outdentBlocks(context.reactEditor, [target.blockId]);
    focusBlockLater(context.root, target.blockId, 0);
    return "handled";
  }

  /**
   * Merges a root block into the previous editable sibling, or removes it.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when a merge or structural removal ran.
   */
  onMergeBackward(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome {
    const { reactEditor, root } = context;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) return "default";
    const scope = navigationDomRoot(root, target.blockId);
    if (removeEmptyBlockAfterStructuralPredecessor(reactEditor, scope, target.blockId)) return "handled";
    const previous = findPreviousEditableBlock(scope, target.blockId);
    if (!previous) return "default";
    const joinOffset = mergeBlocks(reactEditor, previous.blockId, target.blockId);
    focusBlockLater(root, previous.blockId, joinOffset);
    return "handled";
  }

  /**
   * Merges the next editable sibling at a collapsed end caret.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed end caret.
   * @returns `"handled"` when a merge or structural removal ran.
   */
  onMergeForward(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome {
    const { reactEditor, block, root } = context;
    if (reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true) return "default";
    const scope = navigationDomRoot(root, block.id);
    if (removeEmptyBlockAfterStructuralPredecessor(reactEditor, scope, block.id)) return "handled";
    const next = findNextEditableBlock(scope, target.blockId);
    if (!next) return "default";
    const joinOffset = mergeBlocks(reactEditor, block.id, next.blockId);
    focusBlockLater(root, block.id, joinOffset);
    return "handled";
  }

  /**
   * Resets the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the type was reset.
   */
  onResetEmpty(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome {
    const { reactEditor, block, root } = context;
    if (block.content !== "" || reactEditor.isEmptyBlock(block)) return "default";
    const scope = navigationDomRoot(root, block.id);
    if (findPreviousEditableBlock(scope, target.blockId)) return "default";
    resetToWritingType(reactEditor, block.id);
    focusBlockLater(root, block.id, 0);
    return "handled";
  }

  /**
   * Generic blocks do not relocate children before a structural delete.
   *
   * @param _context - Unused selected-block context.
   * @param _ids - Unused structural selection.
   * @returns `"default"` so the shared selection-deletion path proceeds.
   */
  onStructuralDelete(_context: BlockViewContext, _ids: readonly string[]): BlockViewOutcome {
    return "default";
  }

  /**
   * Generic blocks accept children through their editable row.
   *
   * @param _context - Unused drop destination.
   * @returns `true`; full-body container targeting is controlled separately.
   */
  acceptsDrop(_context: BlockViewDropContext): boolean {
    return true;
  }
}
