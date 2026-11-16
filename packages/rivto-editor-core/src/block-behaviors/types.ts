import type { BlockDestination, BlockInput } from "@chulane/document-model";
import type { EditorBlock, EditorBlockNode } from "../editor/model";
import type { BlockManagerApi } from "../managers/types";

/** A direct child's change of parent, before any document write. */
export interface BlockChildTransition {
  /** Child input as transformed by earlier transition processors. */
  readonly child: BlockInput;
  /** Former direct parent, or null for roots and newly created blocks. */
  readonly previousParent: BlockInput | null;
  /** Receiving direct parent, or null for roots and deleted blocks. */
  readonly nextParent: BlockInput | null;
}

/** Detached values supplied to the behavior of a parent whose child changes. */
export interface BlockChildBehaviorContext extends BlockChildTransition {
  /** Parent receiving or losing the direct child. */
  readonly parent: BlockInput;
}

/** Detached roots and destination used to evaluate a structural move. */
export interface BlockStructuralMoveContext {
  /** Source records, including records from a different document. */
  readonly sources: readonly Readonly<Omit<EditorBlock, "children">>[];
  /** Requested location in the destination document. */
  readonly destination: BlockDestination;
  /** Destination parent, or null for document roots. */
  readonly parent: EditorBlockNode | null;
}

/** Outcome of one structural behavior in an ordered chain. */
export type BlockStructuralOutcome = "handled" | "unhandled" | "rejected";

/** Block reads and updates available within the caller's structural scope. */
export interface BlockStructuralScope extends Pick<
  BlockManagerApi,
  "getBlockNode" | "getOrderedIds" | "getParentId" | "getChildIds" | "updateBlock"
> {
  /**
   * Reads the roots visible to this structural scope.
   *
   * @returns Ordered root IDs, which may be a shared read-only snapshot.
   */
  getRootIds(): readonly string[];
}

/** Scoped state supplied to structural operation handlers. */
export interface BlockStructuralContext {
  /** Live scoped block operations; the caller retains transaction ownership. */
  readonly blocks: BlockStructuralScope;
  /** Document-wide operations needed to preserve children across panel boundaries. */
  readonly documentBlocks: Pick<BlockManagerApi, "getBlockNode" | "getParentId" | "moveBlocks">;
  /** Shallow snapshot of the block selecting this behavior. */
  readonly block: EditorBlockNode;
  /** Panel-relative parent of the selected block, or null at the panel root. */
  readonly parentId: string | null;
}

/** Group actions dispatched by panel-scoped block commands. */
export type BlockStructuralAction =
  "onChildIndent" | "onChildOutdent" | "onIndent" | "onOutdent" | "onStructuralDelete";

/** Editor-local structural behavior independent of a presentation framework. */
export interface BlockStructuralBehavior {
  /**
   * Selects whether this behavior applies to the supplied block.
   *
   * @param block - Detached parent or move-candidate fields.
   * @returns True when this behavior participates for the supplied block.
   */
  isAvailable(block: BlockInput): boolean;
  /**
   * Checks a move involving at least one block selected by this behavior.
   *
   * @param context - Detached sources and resolved destination parent.
   * @returns False to reject the move; true permits subsequent checks.
   */
  canMove?(context: BlockStructuralMoveContext): boolean;
  /**
   * Intercepts indentation of direct children before their own behaviors.
   *
   * Handlers may mutate through the supplied block operations. Use the low-level
   * indent command for custom execution rather than recursively dispatching.
   * The invoking interaction owns the transaction and selection updates.
   *
   * @param context - Current parent and scoped operations.
   * @param ids - Complete requested child group.
   * @returns Handled, rejected, or unhandled to continue the chain.
   */
  onChildIndent?(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome;
  /**
   * Intercepts outdent of direct children before their own behaviors.
   *
   * Handlers may mutate through the supplied block operations. Use the low-level
   * outdent command for custom execution rather than recursively dispatching.
   * The invoking interaction owns the transaction and selection updates.
   *
   * @param context - Current parent and scoped operations.
   * @param ids - Complete requested child group.
   * @returns Handled, rejected, or unhandled to continue the chain.
   */
  onChildOutdent?(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome;
  /**
   * Overrides indentation of a requested block group.
   *
   * @param context - Leading block and scoped operations.
   * @param ids - Complete requested group.
   * @returns Handled, rejected, or unhandled to continue the chain.
   */
  onIndent?(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome;
  /**
   * Overrides outdent of a requested block group.
   *
   * @param context - Leading block and scoped operations.
   * @param ids - Complete requested group.
   * @returns Handled, rejected, or unhandled to continue the chain.
   */
  onOutdent?(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome;
  /**
   * Intercepts deletion of a structural selection, possibly preparing its contents.
   *
   * @param context - First selected block matching this behavior and its scope.
   * @param ids - Complete selected group in supplied order.
   * @returns Handled or rejected to claim deletion, or unhandled to continue.
   */
  onStructuralDelete?(
    context: BlockStructuralContext,
    ids: readonly string[],
  ): BlockStructuralOutcome;
  /**
   * Prepares a direct child entering the selected parent.
   *
   * This synchronous hook must not mutate the document or change the child's
   * identity, type, or descendants. Returned fields are validated before the
   * placement is written. It runs for direct children created, imported, or
   * moved into this parent by the owning editor; undo and redo replay recorded
   * changes without calling the hook.
   *
   * @param context - Detached child and both sides of the transition.
   * @returns Transformed child, or undefined to preserve its current data.
   */
  onChildEnter?(context: BlockChildBehaviorContext): BlockInput | undefined;
  /**
   * Prepares a direct child leaving the selected parent.
   *
   * This synchronous hook must not mutate the document or change the child's
   * identity, type, or descendants. Changes returned for a deleted child are
   * discarded with that child. Reordering within the same parent does not
   * invoke either transition hook.
   *
   * TODO: Cross-document transfer imports before removal, so exit transformations
   * are not applied to the imported blocks.
   *
   * @param context - Detached child and both sides of the transition.
   * @returns Transformed child, or undefined to preserve its current data.
   */
  onChildExit?(context: BlockChildBehaviorContext): BlockInput | undefined;
}
