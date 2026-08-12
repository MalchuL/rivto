/** Built-in list modes interpreted by the React list extension. */
export const BLOCK_LIST_TYPES = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
] as const;

/** Concrete built-in list mode represented by the React list extension. */
export type BlockListType = typeof BLOCK_LIST_TYPES[number];

/** Default concrete list properties registered by the built-in list extension. */
export const DEFAULT_BLOCK_LIST_PROPS = { type: "list", checked: false } as const;

/**
 * Tests whether a property value represents a numbered-list mode.
 *
 * @param value - Opaque list-property value to inspect.
 * @returns `true` for a start, ordinary, or continuation numbered-list mode.
 */
export const isNumberedListType = (value: unknown): value is BlockListType =>
  value === "numbered_list" || value === "start_numbered_list" || value === "continue_numbered_list";

/**
 * Computes displayed numbering for one ordered sibling group.
 *
 * @param blocks - Ordered siblings containing IDs and opaque list properties.
 * @returns A map from numbered block IDs to their displayed positive numbers;
 * non-numbered blocks are omitted.
 */
export function resolveBlockListNumbers(
  blocks: readonly { readonly id: string; readonly listProps: Record<string, unknown> }[],
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  let previous: number | undefined;
  let last: number | undefined;
  for (const block of blocks) {
    const type = block.listProps.type;
    const number = type === "start_numbered_list" ? 1
      : type === "numbered_list" ? (previous ?? 0) + 1
      : type === "continue_numbered_list" ? (last ?? 0) + 1
      : undefined;
    previous = number;
    if (number !== undefined) {
      last = number;
      numbers.set(block.id, number);
    }
  }
  return numbers;
}
