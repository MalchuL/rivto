/**
 * Host contracts used to bind block storage to graph value endpoints.
 * A future document adapter can implement this interface without coupling the
 * headless package to CRDT, editor, or React packages.
 */
import type { PropagationContext, ValueBinding } from "@chulane/graph-runtime";
import type { BlockPropertyAddress } from "./addresses";

/** Storage operations supplied by an eventual document or application adapter. */
export interface BlockValueHost {
  /**
   * Reads the current block property through the host.
   *
   * @param address - Block ID and property path identifying the bound value.
   * @returns Host value for the addressed property.
   */
  read(address: BlockPropertyAddress): unknown;
  /**
   * Writes a propagated block property through the host.
   *
   * @param address - Block ID and property path identifying the bound value.
   * @param value - Value to store or publish through this operation.
   * @param context - Propagation run ID and visited-node ancestry accompanying the value.
   * @returns False to report no change; otherwise the host's synchronous or asynchronous completion.
   */
  write(
    address: BlockPropertyAddress,
    value: unknown,
    context: PropagationContext,
  ): void | boolean | Promise<void | boolean>;
  /**
   * Observes host-side changes to an addressed block property.
   *
   * @param address - Block ID and property path identifying the bound value.
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe?(
    address: BlockPropertyAddress,
    listener: (value: unknown, context?: PropagationContext) => void,
  ): () => void;
}

/** Optional registration behavior for one block property. */
export interface BlockPropertyOptions {
  equals?: ValueBinding["equals"];
}
