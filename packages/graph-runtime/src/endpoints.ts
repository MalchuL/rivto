/**
 * Public contracts for live graph endpoints and execution diagnostics.
 * Hosts implement value bindings and slot handlers; snapshots persist only the
 * endpoint declarations defined here.
 */

export const SLOT_RESULT = "result" as const;

/** A persisted value or slot endpoint. */
export interface EndpointDeclaration {
  id: string;
  nodeId: string;
  kind: "value" | "slot";
}

/** Execution ancestry passed through host writes and notifications. */
export interface PropagationContext {
  readonly runId: number;
  readonly visitedNodeIds: ReadonlySet<string>;
}

/** Host implementation for one live value endpoint. */
export interface ValueBinding {
  /**
   * Reads the endpoint's current bound value.
   *
   * @returns Current host value.
   */
  get(): unknown;
  /**
   * Writes a value with its propagation context.
   *
   * @param value - Value to store or publish through this operation.
   * @param context - Propagation run ID and visited-node ancestry accompanying the value.
   * @returns False when unchanged; otherwise synchronous or asynchronous write completion.
   */
  set(value: unknown, context: PropagationContext): void | boolean | Promise<void | boolean>;
  /**
   * Observes changes from the bound host value.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe?(listener: (value: unknown, context?: PropagationContext) => void): () => void;
  /**
   * Compares two endpoint values using the binding's equality semantics.
   *
   * @param left - First endpoint value to compare.
   * @param right - Second endpoint value to compare.
   * @returns Whether the values are equivalent.
   */
  equals?(left: unknown, right: unknown): boolean;
}

/** Operations available while a slot handler is running. */
export interface SlotContext {
  readonly signal: AbortSignal;
  /**
   * Reads a value endpoint during slot execution.
   *
   * @param endpointId - Registered value endpoint ID.
   * @returns Current endpoint value.
   */
  readValue(endpointId: string): unknown;
  /**
   * Writes to a value endpoint through the active graph propagation run.
   *
   * @param endpointId - Registered value endpoint ID.
   * @param value - Value to store or publish through this operation.
   * @returns Completion of the propagated write.
   */
  writeValue(endpointId: string, value: unknown): Promise<void>;
  /**
   * Emits a payload from one of the executing slot's named outputs.
   *
   * @param output - Name of the executing slot's output.
   * @param payload - Payload associated with the operation.
   */
  emit(output: string, payload: unknown): void;
}

/** A synchronous or asynchronous callable slot. */
export type SlotHandler = (payload: unknown, context: SlotContext) => unknown | Promise<unknown>;

/** A failed graph delivery reported without stopping unrelated branches. */
export interface GraphExecutionError {
  phase: "value" | "slot";
  message: string;
  endpointId?: string;
  connectionId?: string;
  cause?: unknown;
}
