/**
 * Coordinates live endpoint registration and deterministic graph execution.
 * Public contracts and pure topology logic live in neighboring modules.
 */
import type { GraphConnection } from "../connections";
import {
  type EndpointDeclaration,
  type GraphExecutionError,
  type PropagationContext,
  type SlotHandler,
  type ValueBinding,
} from "../endpoints";
import { GRAPH_SNAPSHOT_VERSION, parseGraphSnapshot, type GraphSnapshot } from "../snapshot";
import {
  cloneConnection,
  compareById,
  referencesEndpoint,
  requireDeclaredKind,
  validateConnection,
  validateEndpoint,
} from "../topology";
import type { RunState } from "./delivery";
import { SlotFlowExecutor } from "./slot-flow";
import { ValueFlowExecutor } from "./value-flow";

/** Runs a validated graph against host-provided values and functions. */
export class GraphRuntime {
  private readonly declarations = new Map<string, EndpointDeclaration>();
  private readonly connections = new Map<string, GraphConnection>();
  private errorListeners = new Set<(error: GraphExecutionError) => void>();
  private tail: Promise<void> = Promise.resolve();
  private controller = new AbortController();
  private enabled = false;
  private disposed = false;
  private generation = 0;
  private nextRunId = 1;
  private readonly valueFlow = new ValueFlowExecutor(this.declarations, this.connections, {
    isCurrent: (state) => this.isCurrent(state),
    report: (error) => this.report(error),
  });
  private readonly slotFlow = new SlotFlowExecutor(this.declarations, this.connections, this.valueFlow, {
    isCurrent: (state) => this.isCurrent(state),
    report: (error) => this.report(error),
    signal: () => this.controller.signal,
  });

  /** Enables processing for the designated graph runner. */
  enable(): void {
    this.assertAlive();
    if (this.enabled) return;
    this.enabled = true;
    this.controller = new AbortController();
  }

  /** Aborts active work and causes already-scheduled work to be ignored. */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.generation += 1;
    this.controller.abort();
  }

  /** Releases bindings, subscriptions, listeners, and active work. */
  dispose(): void {
    if (this.disposed) return;
    this.disable();
    this.disposed = true;
    this.valueFlow.dispose();
    this.slotFlow.dispose();
    this.errorListeners.clear();
  }

  /** Registers a live value and returns a cleanup function. */
  registerValue(declaration: Omit<EndpointDeclaration, "kind">, binding: ValueBinding): () => void {
    this.assertAlive();
    const endpoint = this.registerDeclaration({ ...declaration, kind: "value" });
    this.valueFlow.register(endpoint.id, binding, (value, context) => void this.publishValue(endpoint.id, value, context));
    return () => this.valueFlow.unregister(endpoint.id, binding);
  }

  /** Registers a callable slot and returns a cleanup function. */
  registerSlot(declaration: Omit<EndpointDeclaration, "kind">, handler: SlotHandler): () => void {
    this.assertAlive();
    const endpoint = this.registerDeclaration({ ...declaration, kind: "slot" });
    this.slotFlow.register(endpoint.id, handler);
    return () => this.slotFlow.unregister(endpoint.id, handler);
  }

  /** Removes a declaration and every connection that references it. */
  removeEndpoint(endpointId: string): boolean {
    this.assertAlive();
    const existed = this.declarations.delete(endpointId);
    this.valueFlow.unregister(endpointId);
    this.slotFlow.unregister(endpointId);
    for (const [id, connection] of this.connections) {
      if (referencesEndpoint(connection, endpointId)) this.connections.delete(id);
    }
    return existed;
  }

  /** Adds one validated connection without performing initial synchronization. */
  connect(connection: GraphConnection): void {
    this.assertAlive();
    validateConnection(connection, this.declarations);
    if (this.connections.has(connection.id)) throw new Error(`Connection ${connection.id} already exists`);
    this.connections.set(connection.id, cloneConnection(connection));
  }

  /** Removes one connection. */
  disconnect(connectionId: string): boolean {
    this.assertAlive();
    return this.connections.delete(connectionId);
  }

  /** Publishes a host-observed change and waits until prior scheduled work finishes. */
  publishValue(endpointId: string, value: unknown, inherited?: PropagationContext): Promise<void> {
    this.requireKind(endpointId, "value");
    if (!this.valueFlow.observe(endpointId, value)) return Promise.resolve();
    return this.schedule((state) => {
      state.queue.push({
        kind: "value",
        endpointId,
        value,
        visitedNodeIds: inherited ? new Set(inherited.visitedNodeIds) : new Set(),
        force: false,
        writeStart: false,
      });
    });
  }

  /** Reconciles an undirected group and directed descendants from one selected value. */
  synchronizeValue(endpointId: string): Promise<void> {
    this.requireKind(endpointId, "value");
    return this.schedule((state) => {
      const binding = this.valueFlow.getBinding(endpointId);
      if (!binding) {
        this.report({ phase: "value", endpointId, message: `Value endpoint ${endpointId} is unavailable` });
        return;
      }
      state.queue.push({ kind: "value", endpointId, value: binding.get(), visitedNodeIds: new Set(), force: true, writeStart: false });
    });
  }

  /** Invokes one slot as a new execution branch. */
  invokeSlot(endpointId: string, payload: unknown): Promise<void> {
    this.requireKind(endpointId, "slot");
    return this.schedule((state) => {
      state.queue.push({ kind: "slot", endpointId, payload, visitedNodeIds: new Set() });
    });
  }

  /** Subscribes to delivery failures. */
  subscribeErrors(listener: (error: GraphExecutionError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Returns a detached, deterministically ordered topology snapshot. */
  getSnapshot(): GraphSnapshot {
    return {
      version: GRAPH_SNAPSHOT_VERSION,
      endpoints: [...this.declarations.values()].sort(compareById).map((item) => ({ ...item })),
      connections: [...this.connections.values()].sort(compareById).map((item) => cloneConnection(item)),
    };
  }

  /** Validates and atomically replaces persisted topology without executing it. */
  loadSnapshot(input: unknown): void {
    this.assertAlive();
    const snapshot = parseGraphSnapshot(input);
    this.declarations.clear();
    this.connections.clear();
    snapshot.endpoints.forEach((endpoint) => this.declarations.set(endpoint.id, endpoint));
    snapshot.connections.forEach((connection) => this.connections.set(connection.id, connection));
    this.valueFlow.reconcile();
    this.slotFlow.reconcile();
  }

  /** Returns whether every endpoint required by a connection is live. */
  isConnectionActive(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    if (connection.kind === "slot-flow") return this.slotFlow.has(connection.from.slotId) && this.slotFlow.has(connection.to);
    const ids = connection.kind === "directed-value" ? [connection.from, connection.to] : connection.endpoints;
    return ids.every((id) => this.valueFlow.has(id));
  }

  /** Serializes public work so independent runs preserve call order. */
  private schedule(operation: (state: RunState) => void | Promise<void>): Promise<void> {
    if (!this.enabled || this.disposed) return Promise.resolve();
    const generation = this.generation;
    const state: RunState = {
      generation,
      runId: this.nextRunId++,
      queue: [],
    };
    const run = this.tail.then(() => generation === this.generation && this.enabled
      ? Promise.resolve(operation(state)).then(() => this.drain(state))
      : undefined);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Processes queued deliveries in first-in, first-out order. */
  private async drain(state: RunState): Promise<void> {
    while (state.queue.length && this.isCurrent(state)) {
      const delivery = state.queue.shift()!;
      if (delivery.kind === "value") await this.valueFlow.deliver(delivery, state);
      else await this.slotFlow.deliver(delivery, state);
    }
  }

  /** Registers or confirms the persisted declaration for one live endpoint. */
  private registerDeclaration(endpoint: EndpointDeclaration): EndpointDeclaration {
    validateEndpoint(endpoint);
    const current = this.declarations.get(endpoint.id);
    if (current && (current.kind !== endpoint.kind || current.nodeId !== endpoint.nodeId)) {
      throw new Error(`Endpoint ${endpoint.id} does not match its persisted declaration`);
    }
    if (!current) this.declarations.set(endpoint.id, endpoint);
    return current ?? endpoint;
  }

  /** Requires a current endpoint of one kind. */
  private requireKind(id: string, kind: EndpointDeclaration["kind"]): EndpointDeclaration {
    requireDeclaredKind(id, kind, this.declarations);
    return this.declarations.get(id)!;
  }

  /** Reports a branch failure to every current listener. */
  private report(error: GraphExecutionError): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  /** Reports whether an operation belongs to the active runner generation. */
  private isCurrent(state: RunState): boolean {
    return this.enabled && !this.disposed && state.generation === this.generation && !this.controller.signal.aborted;
  }

  /** Fails operations attempted after disposal. */
  private assertAlive(): void {
    if (this.disposed) throw new Error("Graph runtime is disposed");
  }

}
