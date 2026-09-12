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
  get(): unknown;
  set(value: unknown, context: PropagationContext): void | boolean | Promise<void | boolean>;
  subscribe?(listener: (value: unknown, context?: PropagationContext) => void): () => void;
  equals?(left: unknown, right: unknown): boolean;
}

/** Operations available while a slot handler is running. */
export interface SlotContext {
  readonly signal: AbortSignal;
  readValue(endpointId: string): unknown;
  writeValue(endpointId: string, value: unknown): Promise<void>;
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
