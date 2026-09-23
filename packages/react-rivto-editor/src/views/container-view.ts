/**
 * Shared defaults for layout containers (boards, lanes, cells).
 *
 * Container views declare a drop axis and, when empty, insert a first child
 * on Enter instead of splitting. Subclasses override axis and delete
 * relocation; React definition metadata owns containment. They return `"default"` when the generic outline
 * path should run.
 *
 * @module
 */
import { focusBlockLater } from "./ops/focus-ops";
import { insertFirstChild } from "./ops/outline-ops";
import { BaseBlockView } from "./base-view";
import type { BlockViewContext, BlockViewOutcome, DropAxis } from "./types";
import type { KeyboardSelectionTarget } from "../managers";

/**
 * Base class for kanban, bento, columns, and table views.
 *
 * The class is a behavior object, not a renderer. Presentation stays in each
 * extension's React component; this type only owns interaction policy.
 */
export class ContainerBlockView extends BaseBlockView {
  override readonly dropAxis: DropAxis | undefined = "vertical";
  override readonly acceptsDropContainer: boolean = true;

  /**
   * Inserts a writing block as the first child when this container is empty.
   *
   * @param context - Empty container that owns the Enter event.
   * @param _target - Keyboard target; unused once emptiness is confirmed.
   * @returns `"handled"` when a child was inserted, otherwise `"default"`.
   */
  override onSplit(context: BlockViewContext, _target: KeyboardSelectionTarget): BlockViewOutcome {
    if (context.block.children.length > 0) return "default";
    return this.insertFirstChild(context);
  }

  /**
   * Inserts a default writing block as the last child and focuses it.
   *
   * @param context - Container that receives the child.
   * @returns `"handled"` after insertion.
   */
  insertFirstChild(context: BlockViewContext): BlockViewOutcome {
    const child = insertFirstChild(context.reactEditor, context.block.id);
    focusBlockLater(context.root, child.id, 0);
    return "handled";
  }
}
