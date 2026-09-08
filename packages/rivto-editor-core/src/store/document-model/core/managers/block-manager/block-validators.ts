import type { BlockInput, BlockValidator } from "../../types";

/**
 * Owns the ordered list of block validators used by document storage.
 *
 * Plugin code registers constraints here so the CRDT block manager never
 * imports a block registry. Validators run in registration order; a later
 * validator receives the block returned by the previous one.
 */
export class BlockValidators {
  /** Installed validators in registration order. */
  private readonly items: BlockValidator[] = [];

  /**
   * Appends one validator until the returned disposer is called.
   *
   * @param validator - Function that validates or normalizes one portable block.
   * @returns Idempotent function that removes this exact registration.
   */
  add(validator: BlockValidator): () => void {
    this.items.push(validator);
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      this.remove(validator);
    };
    return dispose;
  }

  /**
   * Removes the first matching validator instance.
   *
   * @param validator - Previously registered function identity to remove.
   * @returns `true` when a registration was removed.
   */
  remove(validator: BlockValidator): boolean {
    const index = this.items.indexOf(validator);
    if (index < 0) return false;
    this.items.splice(index, 1);
    return true;
  }

  /**
   * Runs every installed validator against one portable block.
   *
   * An empty list is identity: the supplied block is returned unchanged.
   *
   * @param block - Candidate block, which may be partial insert input.
   * @param parentType - Destination parent native type, or `null` at root.
   * @returns The original block or the last validator's replacement.
   */
  apply(block: BlockInput, parentType: string | null): BlockInput {
    return this.items.reduce((current, validate) => validate(current, parentType), block);
  }
}
