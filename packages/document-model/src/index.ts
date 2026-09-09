/**
 * Canonical Rivto document model: blocks, elements, plugin data, and snapshots.
 *
 * Persistence and collaboration go through `@chulane/crdt-doc`. Editor commands,
 * selection, and clipboard stay in `@chulane/rivto` and consume this package.
 */
export * from "./core";
