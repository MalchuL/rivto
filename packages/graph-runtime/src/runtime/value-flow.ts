/**
 * Owns live value bindings and value propagation semantics.
 * Undirected components synchronize first; changed members then enqueue their
 * directed descendants while preserving per-branch node ancestry.
 */
import type { GraphConnection } from "../connections";
import type { EndpointDeclaration, GraphExecutionError, PropagationContext, ValueBinding } from "../endpoints";
import { connectionsOfKind, requireDeclaredKind, valueComponent } from "../topology";
import type { RunState, ValueDelivery } from "./delivery";

/** Runtime callbacks required by value delivery. */
export interface ValueFlowCallbacks {
  isCurrent(state: RunState): boolean;
  report(error: GraphExecutionError): void;
}

/** Registers, reads, and propagates host-owned graph values. */
export class ValueFlowExecutor {
  private readonly values = new Map<string, ValueBinding>();
  private readonly lastValues = new Map<string, unknown>();
  private readonly subscriptions = new Map<string, () => void>();
  private readonly internalContexts = new WeakSet<object>();

  /** Creates value execution over the runtime's stable topology maps. */
  constructor(
    private readonly declarations: Map<string, EndpointDeclaration>,
    private readonly connections: Map<string, GraphConnection>,
    private readonly callbacks: ValueFlowCallbacks,
  ) {}

  /** Registers a live binding and wires optional host notifications. */
  register(
    endpointId: string,
    binding: ValueBinding,
    publish: (value: unknown, context?: PropagationContext) => void,
  ): void {
    if (this.values.has(endpointId)) throw new Error(`Value endpoint ${endpointId} is already registered`);
    this.values.set(endpointId, binding);
    this.lastValues.set(endpointId, binding.get());
    if (binding.subscribe) {
      this.subscriptions.set(endpointId, binding.subscribe((value, context) => {
        if (context && this.internalContexts.has(context as object)) return;
        publish(value, context);
      }));
    }
  }

  /** Detaches one binding while preserving persisted topology. */
  unregister(endpointId: string, expected?: ValueBinding): void {
    if (expected && this.values.get(endpointId) !== expected) return;
    this.subscriptions.get(endpointId)?.();
    this.subscriptions.delete(endpointId);
    this.values.delete(endpointId);
    this.lastValues.delete(endpointId);
  }

  /** Detaches every live value binding. */
  dispose(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.values.clear();
    this.lastValues.clear();
  }

  /** Reports whether one declared value currently has a host binding. */
  has(endpointId: string): boolean {
    return this.values.has(endpointId);
  }

  /** Detaches bindings that no longer match loaded value declarations. */
  reconcile(): void {
    for (const id of this.values.keys()) if (this.declarations.get(id)?.kind !== "value") this.unregister(id);
  }

  /** Returns one binding for explicit synchronization. */
  getBinding(endpointId: string): ValueBinding | undefined {
    return this.values.get(endpointId);
  }

  /** Reads one live value for a slot handler. */
  read(endpointId: string): unknown {
    requireDeclaredKind(endpointId, "value", this.declarations);
    const binding = this.values.get(endpointId);
    if (!binding) throw new Error(`Value endpoint ${endpointId} is unavailable`);
    return binding.get();
  }

  /** Records a host publication and reports whether propagation is needed. */
  observe(endpointId: string, value: unknown): boolean {
    const binding = this.values.get(endpointId);
    const equals = binding?.equals ?? Object.is;
    if (this.lastValues.has(endpointId) && equals(this.lastValues.get(endpointId), value)) return false;
    this.lastValues.set(endpointId, value);
    return true;
  }

  /** Synchronizes one value component and enqueues outgoing directed edges. */
  async deliver(delivery: ValueDelivery, state: RunState): Promise<void> {
    requireDeclaredKind(delivery.endpointId, "value", this.declarations);
    if (!this.callbacks.isCurrent(state)) return;
    const component = valueComponent(delivery.endpointId, this.connections.values());
    const eligible = component.filter((id) => id === delivery.endpointId || !delivery.visitedNodeIds.has(this.declarations.get(id)!.nodeId));
    const visited = new Set(delivery.visitedNodeIds);
    eligible.forEach((id) => visited.add(this.declarations.get(id)!.nodeId));
    const context: PropagationContext = { runId: state.runId, visitedNodeIds: visited };
    const changed: string[] = [];
    for (const id of eligible) {
      if (!this.callbacks.isCurrent(state)) return;
      if (id === delivery.endpointId && !delivery.writeStart) {
        changed.push(id);
        continue;
      }
      const binding = this.values.get(id);
      if (!binding) {
        this.callbacks.report({ phase: "value", endpointId: id, connectionId: delivery.connectionId, message: `Value endpoint ${id} is unavailable` });
        continue;
      }
      const equals = binding.equals ?? Object.is;
      if (!delivery.force && equals(binding.get(), delivery.value)) continue;
      try {
        this.internalContexts.add(context);
        const accepted = await binding.set(delivery.value, context);
        if (accepted === false || !equals(binding.get(), delivery.value)) throw new Error("Host rejected or transformed the assigned value");
        this.lastValues.set(id, delivery.value);
        changed.push(id);
      } catch (cause) {
        this.callbacks.report({ phase: "value", endpointId: id, connectionId: delivery.connectionId, message: `Could not assign value endpoint ${id}`, cause });
      }
    }
    for (const source of changed) {
      const outgoing = connectionsOfKind(this.connections.values(), "directed-value").filter((item) => item.from === source);
      for (const connection of outgoing) {
        const target = this.declarations.get(connection.to)!;
        if (visited.has(target.nodeId)) continue;
        state.queue.push({
          kind: "value",
          endpointId: connection.to,
          value: delivery.value,
          visitedNodeIds: visited,
          force: false,
          writeStart: true,
          connectionId: connection.id,
        });
      }
    }
  }
}
