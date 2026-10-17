/**
 * Shared defaults for layout containers (boards, lanes, cells).
 *
 * Container behaviors, when empty, insert a first child
 * on Enter instead of splitting. Subclasses specialize movement and delete
 * relocation and parent outline interception. Concrete parent handlers own
 * nesting restrictions; the base does not impose them. They return `"unhandled"` when the generic outline
 * path should run.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import { scheduleBlockFocus } from "./utils/focus-ops";
import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorContext,
  BlockBehaviorOutcome,
} from "./types";
import type { KeyboardSelectionTarget } from "../managers";

/**
 * Base class for kanban, bento, columns, and table behaviors.
 *
 * The class is a behavior object, not a renderer. Presentation stays in each
 * extension's React component; this type only owns interaction policy.
 */
export abstract class ContainerBlockBehavior implements BlockBehavior {
  /**
   * Selects the concrete native container represented by this behavior.
   * @param context - Current block fields and runtime, including foreign sources or a receiving parent during move checks.
   * @returns Whether the concrete container behavior applies to this block.
   */
  abstract isAvailable(context: BlockBehaviorAvailabilityContext): boolean;

  /**
   * Inserts a writing block as the first child when this container is empty.
   *
   * @param context - Empty container that owns the Enter event.
   * @param target - Keyboard target; unused once emptiness is confirmed.
   * @returns `"handled"` when a child was inserted, otherwise `"unhandled"`.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    if (context.block.children.length > 0) {
      return "unhandled";
    }
    return this.appendWritingBlock(context);
  }

  /**
   * Appends a default writing block to this container and schedules its caret focus.
   *
   * Expands the container, inserts the child directly inside it, and sets model
   * selection to offset zero in one history batch. Insertion validates the local
   * parent; no temporary document-root placement is observable during creation.
   * DOM focus is restored after React renders the child.
   * When called by onSplit the container is empty, so the appended child is also first.
   *
   * @param context - Container snapshot, receiving editor view, and its DOM root.
   * @returns "handled" after insertion and scheduling focus at offset zero.
   * @throws If a delegated block update, insertion, selection change, or focus scheduling fails.
   */
  appendWritingBlock(context: BlockBehaviorContext): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    let child: EditorBlock | undefined;
    reactPanel.batchUpdates(() => {
      reactPanel.blocks.updateBlock(block.id, { listProps: { collapsed: false } });
      child = reactPanel.blocks.insertBlock(
        reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock(),
        { parentId: block.id },
      );
      reactPanel.selection.set(createCaretSelection(child.id, 0));
    });
    scheduleBlockFocus(reactPanel, root, child!.id, 0);
    return "handled";
  }
}
