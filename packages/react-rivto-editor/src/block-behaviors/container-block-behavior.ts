/**
 * Shared defaults for layout containers (boards, lanes, cells).
 *
 * Container behaviors declare a drop axis and, when empty, insert a first child
 * on Enter instead of splitting. Subclasses override axis and delete
 * relocation; React definition metadata owns containment. They return `"default"` when the generic outline
 * path should run.
 *
 * @module
 */
import { scheduleBlockFocus } from "./ops/focus-ops";
import { appendWritingBlock } from "./ops/outline-ops";
import { DefaultBlockBehavior } from "./default-block-behavior";
import type { BlockBehaviorContext, BlockBehaviorOutcome, DropAxis } from "./types";
import type { KeyboardSelectionTarget } from "../managers/index";

/**
 * Base class for kanban, bento, columns, and table behaviors.
 *
 * The class is a behavior object, not a renderer. Presentation stays in each
 * extension's React component; this type only owns interaction policy.
 */
export class ContainerBlockBehavior extends DefaultBlockBehavior {
  override readonly dropAxis: DropAxis | undefined = "vertical";
  override readonly acceptsDropContainer: boolean = true;

  /**
   * Inserts a writing block as the first child when this container is empty.
   *
   * @param context - Empty container that owns the Enter event.
   * @param _target - Keyboard target; unused once emptiness is confirmed.
   * @returns `"handled"` when a child was inserted, otherwise `"default"`.
   */
  override onSplit(context: BlockBehaviorContext, _target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    if (context.block.children.length > 0) return "default";
    return this.appendWritingBlock(context);
  }

  /**
   * Appends a default writing block to this container and schedules its caret focus.
   *
   * The helper expands the container, creates and moves the child, and sets model
   * selection in one history batch. DOM focus is restored after React renders it.
   * When called by onSplit the container is empty, so the appended child is also first.
   * @param context - Container snapshot, receiving editor view, and its DOM root.
   * @returns "handled" after insertion and scheduling focus at offset zero.
   */
  appendWritingBlock(context: BlockBehaviorContext): BlockBehaviorOutcome {
    const child = appendWritingBlock(context.editorView, context.block.id);
    scheduleBlockFocus(context.editorView, context.root, child.id, 0);
    return "handled";
  }
}
