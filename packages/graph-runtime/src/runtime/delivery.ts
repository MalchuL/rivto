/**
 * Internal FIFO delivery records shared by value and slot executors.
 * These types are deliberately absent from the public package barrel.
 */

/** Mutable state for one serialized graph run. */
export interface RunState {
  readonly generation: number;
  readonly runId: number;
  readonly queue: Delivery[];
}

/** A queued value propagation step. */
export interface ValueDelivery {
  kind: "value";
  endpointId: string;
  value: unknown;
  visitedNodeIds: ReadonlySet<string>;
  force: boolean;
  writeStart: boolean;
  connectionId?: string;
}

/** A queued slot invocation step. */
export interface SlotDelivery {
  kind: "slot";
  endpointId: string;
  payload: unknown;
  visitedNodeIds: ReadonlySet<string>;
  connectionId?: string;
}

/** Any item processed by the runtime FIFO queue. */
export type Delivery = ValueDelivery | SlotDelivery;
