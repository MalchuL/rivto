import type { BlockInput } from "@chulane/document-model";
import type { BlockStructuralMoveContext, BlockStructuralOutcome } from "@chulane/rivto";
import { ContainerBlockBehavior } from "../../block-behaviors/container-block-behavior";

/** Direct parent and child shell types required by a native container. */
type ContainerHierarchy = {
  readonly blockType: string;
  readonly parentType?: string;
  readonly childType?: string;
};

/** Enforces the native hierarchy of boards, columns, rows and cells. */
export class ContainerHierarchyBehavior extends ContainerBlockBehavior {
  /**
   * Binds the behavior to one native shell and its permitted neighbors.
   *
   * @param hierarchy - Native block type and optional restrictions on its direct parent and children.
   */
  constructor(private readonly hierarchy: ContainerHierarchy) {
    super();
  }

  /**
   * Selects the native shell type governed by this policy.
   *
   * @param block - Current source or receiving block, including detached cross-document sources.
   * @returns Whether its type matches the configured shell.
   */
  override isAvailable(block: BlockInput): boolean {
    return block.type === this.hierarchy.blockType;
  }

  /**
   * Checks both ends of a move against the native container hierarchy.
   *
   * Moving a shell requires an allowed parent. Moving into a shell requires
   * every selected root to be an allowed child, including cross-document roots.
   *
   * @param context - Detached source roots and the receiving parent.
   * @returns Whether both source and destination permit this move.
   */
  canMove(context: BlockStructuralMoveContext): boolean {
    const { blockType, parentType, childType } = this.hierarchy;
    if (
      parentType &&
      context.sources.some((source) => source.type === blockType) &&
      context.parent?.type !== parentType
    ) {
      // Moving any governed shell requires its native parent at the destination.
      return false;
    }
    return (
      context.parent?.type !== blockType ||
      !childType ||
      context.sources.every((source) => source.type === childType)
    );
  }

  /**
   * Preserves the fixed depth of direct structural children while allowing writing blocks to indent.
   *
   * The parent handler rejects the complete requested group before child behavior runs.
   * This outline restriction leaves independently permitted dragging available.
   *
   * @returns Rejected for structural shells; unhandled when the container accepts ordinary blocks.
   */
  onChildIndent(): BlockStructuralOutcome {
    return this.hierarchy.childType ? "rejected" : "unhandled";
  }

  /**
   * Keeps direct children within this container during outline outdent.
   *
   * This outline restriction does not prevent independently permitted dragging.
   * The handler rejects the complete requested group before child behavior runs.
   *
   * @returns Rejected without mutating the document.
   */
  onChildOutdent(): BlockStructuralOutcome {
    return "rejected";
  }
}
