/**
 * Owns callable slot registration and output routing.
 * Handlers execute sequentially; named emissions enqueue before the returned
 * result, and value access delegates to the separate value executor.
 */
import type { GraphConnection } from "../connections";
import { SLOT_RESULT, type EndpointDeclaration, type GraphExecutionError, type PropagationContext, type SlotHandler } from "../endpoints";
import { connectionsOfKind, requireId } from "../topology";
import type { RunState, SlotDelivery } from "./delivery";
import type { ValueFlowExecutor } from "./value-flow";

/** Runtime callbacks required by slot delivery. */
export interface SlotFlowCallbacks {
  isCurrent(state: RunState): boolean;
  report(error: GraphExecutionError): void;
  signal(): AbortSignal;
}

/** Registers and executes callable slots independently from value connections. */
export class SlotFlowExecutor {
  private readonly slots = new Map<string, SlotHandler>();

  /** Creates slot execution over the runtime's stable topology maps. */
  constructor(
    private readonly declarations: Map<string, EndpointDeclaration>,
    private readonly connections: Map<string, GraphConnection>,
    private readonly values: ValueFlowExecutor,
    private readonly callbacks: SlotFlowCallbacks,
  ) {}

  /** Registers a live slot handler. */
  register(endpointId: string, handler: SlotHandler): void {
    if (this.slots.has(endpointId)) throw new Error(`Slot endpoint ${endpointId} is already registered`);
    this.slots.set(endpointId, handler);
  }

  /** Detaches one handler when it is still the expected registration. */
  unregister(endpointId: string, expected?: SlotHandler): void {
    if (!expected || this.slots.get(endpointId) === expected) this.slots.delete(endpointId);
  }

  /** Detaches all live handlers. */
  dispose(): void {
    this.slots.clear();
  }

  /** Reports whether one declared slot currently has a handler. */
  has(endpointId: string): boolean {
    return this.slots.has(endpointId);
  }

  /** Detaches handlers that no longer match loaded slot declarations. */
  reconcile(): void {
    for (const id of this.slots.keys()) if (this.declarations.get(id)?.kind !== "slot") this.slots.delete(id);
  }

  /** Runs one slot and enqueues named emissions before its returned result. */
  async deliver(delivery: SlotDelivery, state: RunState): Promise<void> {
    if (!this.callbacks.isCurrent(state)) return;
    const declaration = this.declarations.get(delivery.endpointId)!;
    if (delivery.visitedNodeIds.has(declaration.nodeId)) return;
    const handler = this.slots.get(delivery.endpointId);
    if (!handler) {
      this.callbacks.report({ phase: "slot", endpointId: delivery.endpointId, connectionId: delivery.connectionId, message: `Slot endpoint ${delivery.endpointId} is unavailable` });
      return;
    }
    const visited = new Set(delivery.visitedNodeIds).add(declaration.nodeId);
    const context: PropagationContext = { runId: state.runId, visitedNodeIds: visited };
    const emissions: Array<{ output: string; payload: unknown }> = [];
    try {
      const result = await handler(delivery.payload, {
        signal: this.callbacks.signal(),
        readValue: (id) => this.values.read(id),
        writeValue: (id, value) => this.values.deliver({
          kind: "value",
          endpointId: id,
          value,
          visitedNodeIds: context.visitedNodeIds,
          force: false,
          writeStart: true,
        }, state),
        emit: (output, payload) => {
          requireId(output, "Slot output");
          if (output === SLOT_RESULT) throw new Error(`${SLOT_RESULT} is reserved for returned values`);
          emissions.push({ output, payload });
        },
      });
      if (!this.callbacks.isCurrent(state)) return;
      for (const emission of emissions) this.route(delivery.endpointId, emission.output, emission.payload, visited, state);
      this.route(delivery.endpointId, SLOT_RESULT, result, visited, state);
    } catch (cause) {
      this.callbacks.report({ phase: "slot", endpointId: delivery.endpointId, connectionId: delivery.connectionId, message: `Slot ${delivery.endpointId} failed`, cause });
    }
  }

  /** Enqueues every matching outgoing slot connection in stable order. */
  private route(slotId: string, output: string, payload: unknown, visitedNodeIds: ReadonlySet<string>, state: RunState): void {
    const outgoing = connectionsOfKind(this.connections.values(), "slot-flow")
      .filter((item) => item.from.slotId === slotId && item.from.output === output);
    outgoing.forEach((connection) => state.queue.push({
      kind: "slot",
      endpointId: connection.to,
      payload,
      visitedNodeIds,
      connectionId: connection.id,
    }));
  }
}
