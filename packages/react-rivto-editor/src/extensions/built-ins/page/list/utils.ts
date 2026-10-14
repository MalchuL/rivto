/**
 * List property contracts and numbering projection for page block rendering.
 * Persistence remains ordinary block listProps; this module only interprets
 * those values for React controls, shortcuts, and visible numbering.
 *
 * @module
 */
import type { BlockListType } from "./types";

export type { BlockListType } from "./types";

/** Supported list modes. */
export const BLOCK_LIST_TYPES = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
] as const satisfies readonly BlockListType[];

/** Default concrete list properties registered by the built-in list extension. */
export const DEFAULT_BLOCK_LIST_PROPS = { type: "list", checked: false } as const;

/**
 * Tests whether a property value represents a numbered-list mode.
 *
 * @param value - Opaque list-property value to inspect.
 * @returns Whether the value is a numbered-list mode.
 */
export const isNumberedListType = (value: unknown): value is BlockListType =>
  value === "numbered_list" ||
  value === "start_numbered_list" ||
  value === "continue_numbered_list";

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
    let number: number | undefined;
    if (type === "start_numbered_list") {
      number = 1;
    } else if (type === "numbered_list") {
      number = (previous ?? 0) + 1;
    } else if (type === "continue_numbered_list") {
      number = (last ?? 0) + 1;
    }
    previous = number;
    if (number !== undefined) {
      last = number;
      numbers.set(block.id, number);
    }
  }
  return numbers;
}
