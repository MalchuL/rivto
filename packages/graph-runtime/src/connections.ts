/**
 * Portable connection shapes for value synchronization and callable slot flow.
 * The discriminant prevents property-to-slot and slot-to-property connections.
 */

/** Copies changes from one value endpoint to another. */
export interface DirectedValueConnection {
  id: string;
  kind: "directed-value";
  from: string;
  to: string;
}

/** Synchronizes the two value endpoints in either direction. */
export interface UndirectedValueConnection {
  id: string;
  kind: "undirected-value";
  endpoints: readonly [string, string];
}

/** Routes one slot output into another slot invocation. */
export interface SlotConnection {
  id: string;
  kind: "slot-flow";
  from: { slotId: string; output: string };
  to: string;
}

/** Any connection persisted by the runtime. */
export type GraphConnection = DirectedValueConnection | UndirectedValueConnection | SlotConnection;
