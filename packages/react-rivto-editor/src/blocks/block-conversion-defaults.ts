import type { ExtensionsApi } from "../managers/extensions/api";

/** Shared list-property defaults used when a block is converted to another type. */
export const BLOCK_CONVERSION_DEFAULTS_KEY = "rivto.blocks.conversion-defaults";

/** Detached list-property values owned by one conversion contribution. */
export type BlockConversionDefaults = Readonly<Record<string, unknown>>;

/**
 * Registers list-property values to reset when converting a block's type.
 *
 * Contributions are applied in registration order and released with their
 * extension. Each registration is independent, even for equal property values.
 *
 * @param extensions - Shared runtime and cleanup registration borrowed from the editor.
 * @param defaults - Detached properties to apply during conversion.
 * @returns Idempotent disposer removing this contribution and its reservation.
 * @throws If registration or a synchronous change subscriber fails.
 */
export function registerBlockConversionDefaults(
  extensions: Pick<ExtensionsApi, "shared" | "registerCleanup">,
  defaults: BlockConversionDefaults,
): () => void {
  const shared = extensions.shared;
  const release = shared.reserve(BLOCK_CONVERSION_DEFAULTS_KEY, "array");
  const entries = shared.getArray<BlockConversionDefaults>(BLOCK_CONVERSION_DEFAULTS_KEY)!;
  const contribution = { ...defaults };
  const dispose = extensions.registerCleanup(() => {
    try {
      const index = entries.values().indexOf(contribution);
      if (index !== -1) {
        entries.splice(index, 1);
      }
    } finally {
      release();
    }
  });
  try {
    entries.splice(entries.values().length, 0, contribution);
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
