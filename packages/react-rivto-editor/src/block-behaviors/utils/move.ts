import type { BlockMoveContext } from "../types";

/**
 * Enforces native structural shell restrictions for sources and the receiving parent.
 * @param context - Move request with current destination parent.
 * @param type - Native type whose restrictions are checked.
 * @param parentTypes - Permitted parent types for moved shells; omitted means unrestricted.
 * @param childTypes - Permitted direct child types when receiving roots; omitted means unrestricted.
 * @returns False when a moved shell has an invalid parent or the receiver rejects a source type.
 */
export function canMoveBlockType(
  context: BlockMoveContext,
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
