import type { BlockStructuralBehavior } from "@chulane/rivto";

/**
 * Creates the structural move policy for one native block type.
 *
 * @param type - Native type governed by this policy.
 * @param parentTypes - Allowed parent types for moved shells, or undefined for any parent.
 * @param childTypes - Allowed direct child types, or undefined for any child.
 * @returns Core behavior that applies these restrictions to all move inputs.
 */
export function createBlockTypeMoveBehavior(
  type: string,
  parentTypes?: readonly string[],
  childTypes?: readonly string[],
): BlockStructuralBehavior {
  return {
    /**
     * Selects the native shell type governed by this move policy.
     *
     * @param block - Source or receiving block being checked.
     * @returns Whether its type matches the configured shell.
     */
    isAvailable: (block) => block.type === type,
    /**
     * Checks both ends of the move against the native container hierarchy.
     *
     * Moving a shell requires an allowed parent. Moving into a shell requires
     * every selected root to be an allowed child, including cross-document roots.
     *
     * @param context - Detached source roots and the receiving parent.
     * @returns Whether both source and destination permit this move.
     */
    canMove(context) {
      if (
        parentTypes &&
        context.sources.some((source) => source.type === type) &&
        (!context.parent || !parentTypes.includes(context.parent.type))
      ) {
        return false;
      }
      return (
        context.parent?.type !== type ||
        !childTypes ||
        context.sources.every((source) => childTypes.includes(source.type))
      );
    },
  };
}
