import type { BlockStructuralBehavior, BlockStructuralMoveContext } from "@chulane/rivto";

/**
 * Enforces native structural shell restrictions for sources and the receiving parent.
 * @param context - Move request with current destination parent.
 * @param type - Native type whose restrictions are checked.
 * @param parentTypes - Permitted parent types for moved shells; omitted means unrestricted.
 * @param childTypes - Permitted direct child types when receiving roots; omitted means unrestricted.
 * @returns False when a moved shell has an invalid parent or the receiver rejects a source type.
 */
function canMoveBlockType(
  context: BlockStructuralMoveContext,
  type: string,
  parentTypes?: readonly string[],
  childTypes?: readonly string[],
): boolean {
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
}

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
    isAvailable: (block) => block.type === type,
    canMove: (context) => canMoveBlockType(context, type, parentTypes, childTypes),
  };
}
