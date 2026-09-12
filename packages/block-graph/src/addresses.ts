/**
 * Portable addresses for top-level block values supported by the graph adapter.
 * Address serialization escapes every dynamic segment to avoid endpoint-ID collisions.
 */

/** A graph-addressable top-level block value. */
export type BlockPropertyAddress =
  | { blockId: string; field: "content" }
  | { blockId: string; field: "props"; key: string }
  | { blockId: string; field: "pluginData"; namespace: string };

/** Builds a stable endpoint ID for a block property address. */
export function blockPropertyId(address: BlockPropertyAddress): string {
  const parts = address.field === "content"
    ? [address.blockId, address.field]
    : [address.blockId, address.field, address.field === "props" ? address.key : address.namespace];
  return `block:${parts.map(encodeURIComponent).join(":")}`;
}
