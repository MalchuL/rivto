/**
 * Host contracts used to bind block storage to graph value endpoints.
 * A future document adapter can implement this interface without coupling the
 * headless package to CRDT, editor, or React packages.
 */
import type { PropagationContext, ValueBinding } from "@chulane/graph-runtime";
import type { BlockPropertyAddress } from "./addresses";

/** Storage operations supplied by an eventual document or application adapter. */
export interface BlockValueHost {
  read(address: BlockPropertyAddress): unknown;
  write(address: BlockPropertyAddress, value: unknown, context: PropagationContext): void | boolean | Promise<void | boolean>;
  subscribe?(address: BlockPropertyAddress, listener: (value: unknown, context?: PropagationContext) => void): () => void;
}

/** Optional registration behavior for one block property. */
export interface BlockPropertyOptions {
  equals?: ValueBinding["equals"];
}
