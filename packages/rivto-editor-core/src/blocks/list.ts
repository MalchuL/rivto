/** Persisted presentation modes supported by every block. */
export const BLOCK_LIST_TYPES = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
] as const;

/** Rendering mode used when a block participates in a sibling sequence. */
export type BlockListType = typeof BLOCK_LIST_TYPES[number];

/**
 * Presentation properties used when several sibling blocks render together.
 *
 * The group exists specifically for rendering a block as part of a sequence:
 * it controls the marker, sibling-derived numbering, and checkbox state
 * without changing the block's native type or content. Keeping this state in
 * one object also leaves room for future multi-block presentation properties.
 */
export interface BlockListProps {
  /** Presentation and numbering behavior. */
  type: BlockListType;
  /** Completion state used when `type` is `checkbox`. */
  checked: boolean;
}

/** Default presentation used when new blocks omit an explicit list mode. */
export const DEFAULT_BLOCK_LIST_TYPE: BlockListType = "list";

/** Complete default list presentation assigned to newly created blocks. */
export const DEFAULT_BLOCK_LIST_PROPS: Readonly<BlockListProps> = {
  type: DEFAULT_BLOCK_LIST_TYPE,
  checked: false,
};

/** Returns whether a list mode participates in sibling numbering. */
export const isNumberedListType = (value: BlockListType): boolean =>
  value === "numbered_list" ||
  value === "start_numbered_list" ||
  value === "continue_numbered_list";

/**
 * Computes displayed numbers for one ordered group of sibling blocks.
 *
 * A start item resets to one, a normal numbered item follows only an adjacent
 * numbered item, and a continue item resumes the most recent numbered item
 * through intervening non-numbered siblings.
 *
 * @param blocks - Siblings in persisted document order.
 * @returns Block-ID to displayed-number mapping for numbered siblings only.
 */
export function resolveBlockListNumbers(
  blocks: readonly { readonly id: string; readonly listProps: Pick<BlockListProps, "type"> }[],
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  let previousNumber: number | undefined;
  let previousWasNumbered = false;
  let lastNumber: number | undefined;

  for (const block of blocks) {
    let number: number | undefined;
    if (block.listProps.type === "start_numbered_list") number = 1;
    else if (block.listProps.type === "numbered_list") number = previousWasNumbered ? previousNumber! + 1 : 1;
    else if (block.listProps.type === "continue_numbered_list") number = (lastNumber ?? 0) + 1;

    if (number === undefined) {
      previousWasNumbered = false;
      previousNumber = undefined;
      continue;
    }
    numbers.set(block.id, number);
    previousWasNumbered = true;
    previousNumber = number;
    lastNumber = number;
  }
  return numbers;
}
