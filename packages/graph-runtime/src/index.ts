/**
 * Dependency-free directed graph execution for values and callable slots.
 * The runtime owns scheduling and portable topology while hosts own live values,
 * persistence, functions, and lifecycle integration.
 */

export const GRAPH_SNAPSHOT_VERSION = 1 as const;
export const SLOT_RESULT = "result" as const;

/** A persisted value or slot endpoint. */
export interface EndpointDeclaration {
  id: string;
  nodeId: string;
  kind: "value" | "slot";
}

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

/** Portable topology without runtime values or executable handlers. */
export interface GraphSnapshot {
  version: typeof GRAPH_SNAPSHOT_VERSION;
  endpoints: EndpointDeclaration[];
  connections: GraphConnection[];
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

interface RunState {
  readonly generation: number;
  readonly runId: number;
  readonly queue: Delivery[];
}

type Delivery = ValueDelivery | SlotDelivery;

interface ValueDelivery {
  kind: "value";
  endpointId: string;
  value: unknown;
  visitedNodeIds: ReadonlySet<string>;
  force: boolean;
  writeStart: boolean;
  connectionId?: string;
}

interface SlotDelivery {
  kind: "slot";
  endpointId: string;
  payload: unknown;
  visitedNodeIds: ReadonlySet<string>;
  connectionId?: string;
}

/** Runs a validated graph against host-provided values and functions. */
export class GraphRuntime {
  private declarations = new Map<string, EndpointDeclaration>();
  private connections = new Map<string, GraphConnection>();
  private values = new Map<string, ValueBinding>();
  private slots = new Map<string, SlotHandler>();
  private lastValues = new Map<string, unknown>();
  private subscriptions = new Map<string, () => void>();
  private errorListeners = new Set<(error: GraphExecutionError) => void>();
  private internalContexts = new WeakSet<object>();
  private tail: Promise<void> = Promise.resolve();
  private controller = new AbortController();
  private enabled = false;
  private disposed = false;
  private generation = 0;
  private nextRunId = 1;

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
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.values.clear();
    this.lastValues.clear();
    this.slots.clear();
    this.errorListeners.clear();
  }

  /** Registers a live value and returns a cleanup function. */
  registerValue(declaration: Omit<EndpointDeclaration, "kind">, binding: ValueBinding): () => void {
    this.assertAlive();
    const endpoint = this.registerDeclaration({ ...declaration, kind: "value" });
    if (this.values.has(endpoint.id)) throw new Error(`Value endpoint ${endpoint.id} is already registered`);
    this.values.set(endpoint.id, binding);
    this.lastValues.set(endpoint.id, binding.get());
    if (binding.subscribe) {
      this.subscriptions.set(endpoint.id, binding.subscribe((value, context) => {
        if (context && this.internalContexts.has(context as object)) return;
        void this.publishValue(endpoint.id, value, context);
      }));
    }
    return () => this.unregisterValue(endpoint.id, binding);
  }

  /** Registers a callable slot and returns a cleanup function. */
  registerSlot(declaration: Omit<EndpointDeclaration, "kind">, handler: SlotHandler): () => void {
    this.assertAlive();
    const endpoint = this.registerDeclaration({ ...declaration, kind: "slot" });
    if (this.slots.has(endpoint.id)) throw new Error(`Slot endpoint ${endpoint.id} is already registered`);
    this.slots.set(endpoint.id, handler);
    return () => {
      if (this.slots.get(endpoint.id) === handler) this.slots.delete(endpoint.id);
    };
  }

  /** Removes a declaration and every connection that references it. */
  removeEndpoint(endpointId: string): boolean {
    this.assertAlive();
    const existed = this.declarations.delete(endpointId);
    this.unregisterValue(endpointId);
    this.slots.delete(endpointId);
    for (const [id, connection] of this.connections) {
      if (this.references(connection, endpointId)) this.connections.delete(id);
    }
    return existed;
  }

  /** Adds one validated connection without performing initial synchronization. */
  connect(connection: GraphConnection): void {
    this.assertAlive();
    this.validateConnection(connection, this.declarations);
    if (this.connections.has(connection.id)) throw new Error(`Connection ${connection.id} already exists`);
    this.connections.set(connection.id, this.cloneConnection(connection));
  }

  /** Removes one connection. */
  disconnect(connectionId: string): boolean {
    this.assertAlive();
    return this.connections.delete(connectionId);
  }

  /** Publishes a host-observed change and waits until prior scheduled work finishes. */
  publishValue(endpointId: string, value: unknown, inherited?: PropagationContext): Promise<void> {
    this.requireKind(endpointId, "value");
    const binding = this.values.get(endpointId);
    const equals = binding?.equals ?? Object.is;
    if (this.lastValues.has(endpointId) && equals(this.lastValues.get(endpointId), value)) return Promise.resolve();
    this.lastValues.set(endpointId, value);
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
      const binding = this.values.get(endpointId);
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
      endpoints: [...this.declarations.values()].sort(this.byId).map((item) => ({ ...item })),
      connections: [...this.connections.values()].sort(this.byId).map((item) => this.cloneConnection(item)),
    };
  }

  /** Validates and atomically replaces persisted topology without executing it. */
  loadSnapshot(input: unknown): void {
    this.assertAlive();
    const snapshot = this.parseSnapshot(input);
    this.declarations = new Map(snapshot.endpoints.map((endpoint) => [endpoint.id, endpoint]));
    this.connections = new Map(snapshot.connections.map((connection) => [connection.id, connection]));
    for (const id of this.values.keys()) if (this.declarations.get(id)?.kind !== "value") this.unregisterValue(id);
    for (const id of this.slots.keys()) if (this.declarations.get(id)?.kind !== "slot") this.slots.delete(id);
  }

  /** Returns whether every endpoint required by a connection is live. */
  isConnectionActive(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    if (connection.kind === "slot-flow") return this.slots.has(connection.from.slotId) && this.slots.has(connection.to);
    const ids = connection.kind === "directed-value" ? [connection.from, connection.to] : connection.endpoints;
    return ids.every((id) => this.values.has(id));
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

  /** Synchronizes one value component, then follows its outgoing directed edges. */
  private async deliverValue(delivery: ValueDelivery, state: RunState): Promise<void> {
    if (!this.isCurrent(state)) return;
    const component = this.valueComponent(delivery.endpointId);
    const eligible = component.filter((id) => id === delivery.endpointId || !delivery.visitedNodeIds.has(this.declarations.get(id)!.nodeId));
    const visited = new Set(delivery.visitedNodeIds);
    eligible.forEach((id) => visited.add(this.declarations.get(id)!.nodeId));
    const context: PropagationContext = { runId: state.runId, visitedNodeIds: visited };
    const changed: string[] = [];
    for (const id of eligible) {
      if (!this.isCurrent(state)) return;
      if (id === delivery.endpointId && !delivery.writeStart) {
        changed.push(id);
        continue;
      }
      const binding = this.values.get(id);
      if (!binding) {
        this.report({ phase: "value", endpointId: id, connectionId: delivery.connectionId, message: `Value endpoint ${id} is unavailable` });
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
        this.report({ phase: "value", endpointId: id, connectionId: delivery.connectionId, message: `Could not assign value endpoint ${id}`, cause });
      }
    }
    for (const source of changed) {
      const outgoing = this.sortedConnections("directed-value").filter((item) => item.from === source);
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

  /** Runs one slot and routes named emissions before its return value. */
  private async runSlot(delivery: SlotDelivery, state: RunState): Promise<void> {
    if (!this.isCurrent(state)) return;
    const declaration = this.declarations.get(delivery.endpointId)!;
    if (delivery.visitedNodeIds.has(declaration.nodeId)) return;
    const handler = this.slots.get(delivery.endpointId);
    if (!handler) {
      this.report({ phase: "slot", endpointId: delivery.endpointId, connectionId: delivery.connectionId, message: `Slot endpoint ${delivery.endpointId} is unavailable` });
      return;
    }
    const visited = new Set(delivery.visitedNodeIds).add(declaration.nodeId);
    const context: PropagationContext = { runId: state.runId, visitedNodeIds: visited };
    const emissions: Array<{ output: string; payload: unknown }> = [];
    try {
      const result = await handler(delivery.payload, {
        signal: this.controller.signal,
        readValue: (id) => this.readValue(id),
        writeValue: (id, assigned) => this.writeFromSlot(id, assigned, context, state),
        emit: (output, emitted) => {
          this.requireId(output, "Slot output");
          if (output === SLOT_RESULT) throw new Error(`${SLOT_RESULT} is reserved for returned values`);
          emissions.push({ output, payload: emitted });
        },
      });
      if (!this.isCurrent(state)) return;
      for (const emission of emissions) this.routeSlotOutput(delivery.endpointId, emission.output, emission.payload, visited, state);
      this.routeSlotOutput(delivery.endpointId, SLOT_RESULT, result, visited, state);
    } catch (cause) {
      this.report({ phase: "slot", endpointId: delivery.endpointId, connectionId: delivery.connectionId, message: `Slot ${delivery.endpointId} failed`, cause });
    }
  }

  /** Routes one output through stable connection order. */
  private routeSlotOutput(slotId: string, output: string, payload: unknown, visitedNodeIds: ReadonlySet<string>, state: RunState): void {
    const outgoing = this.sortedConnections("slot-flow")
      .filter((item) => item.from.slotId === slotId && item.from.output === output);
    for (const connection of outgoing) state.queue.push({
      kind: "slot",
      endpointId: connection.to,
      payload,
      visitedNodeIds,
      connectionId: connection.id,
    });
  }

  /** Reads one live value for a slot handler. */
  private readValue(endpointId: string): unknown {
    this.requireKind(endpointId, "value");
    const binding = this.values.get(endpointId);
    if (!binding) throw new Error(`Value endpoint ${endpointId} is unavailable`);
    return binding.get();
  }

  /** Applies a slot-owned value write with the slot branch ancestry. */
  private async writeFromSlot(endpointId: string, value: unknown, context: PropagationContext, state: RunState): Promise<void> {
    this.requireKind(endpointId, "value");
    await this.deliverValue({
      kind: "value",
      endpointId,
      value,
      visitedNodeIds: context.visitedNodeIds,
      force: false,
      writeStart: true,
    }, state);
  }

  /** Processes queued deliveries in first-in, first-out order. */
  private async drain(state: RunState): Promise<void> {
    while (state.queue.length && this.isCurrent(state)) {
      const delivery = state.queue.shift()!;
      if (delivery.kind === "value") await this.deliverValue(delivery, state);
      else await this.runSlot(delivery, state);
    }
  }

  /** Finds the transitive undirected value component in stable endpoint order. */
  private valueComponent(start: string): string[] {
    const found = new Set([start]);
    const queue = [start];
    const edges = this.sortedConnections("undirected-value");
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges) {
        const other = edge.endpoints[0] === current ? edge.endpoints[1]
          : edge.endpoints[1] === current ? edge.endpoints[0] : undefined;
        if (other && !found.has(other)) {
          found.add(other);
          queue.push(other);
        }
      }
    }
    return [...found].sort();
  }

  /** Registers or confirms the persisted declaration for one live endpoint. */
  private registerDeclaration(endpoint: EndpointDeclaration): EndpointDeclaration {
    this.validateEndpoint(endpoint);
    const current = this.declarations.get(endpoint.id);
    if (current && (current.kind !== endpoint.kind || current.nodeId !== endpoint.nodeId)) {
      throw new Error(`Endpoint ${endpoint.id} does not match its persisted declaration`);
    }
    if (!current) this.declarations.set(endpoint.id, endpoint);
    return current ?? endpoint;
  }

  /** Detaches a value binding while preserving persisted topology. */
  private unregisterValue(endpointId: string, expected?: ValueBinding): void {
    if (expected && this.values.get(endpointId) !== expected) return;
    this.subscriptions.get(endpointId)?.();
    this.subscriptions.delete(endpointId);
    this.values.delete(endpointId);
    this.lastValues.delete(endpointId);
  }

  /** Parses a complete snapshot before state replacement. */
  private parseSnapshot(input: unknown): GraphSnapshot {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Graph snapshot must be an object");
    const raw = input as Partial<GraphSnapshot>;
    if (raw.version !== GRAPH_SNAPSHOT_VERSION) throw new Error(`Unsupported graph snapshot version ${String(raw.version)}`);
    if (!Array.isArray(raw.endpoints) || !Array.isArray(raw.connections)) throw new Error("Graph snapshot arrays are required");
    const endpoints = raw.endpoints.map((item) => ({ ...item }));
    const declarations = new Map<string, EndpointDeclaration>();
    endpoints.forEach((endpoint) => {
      this.validateEndpoint(endpoint);
      if (declarations.has(endpoint.id)) throw new Error(`Duplicate endpoint ${endpoint.id}`);
      declarations.set(endpoint.id, endpoint);
    });
    const connections = raw.connections.map((item) => this.cloneConnection(item));
    const ids = new Set<string>();
    connections.forEach((connection) => {
      this.validateConnection(connection, declarations);
      if (ids.has(connection.id)) throw new Error(`Duplicate connection ${connection.id}`);
      ids.add(connection.id);
    });
    return { version: GRAPH_SNAPSHOT_VERSION, endpoints, connections };
  }

  /** Validates a portable endpoint declaration. */
  private validateEndpoint(endpoint: EndpointDeclaration): void {
    if (!endpoint || typeof endpoint !== "object") throw new Error("Endpoint must be an object");
    this.requireId(endpoint.id, "Endpoint ID");
    this.requireId(endpoint.nodeId, "Node ID");
    if (endpoint.kind !== "value" && endpoint.kind !== "slot") throw new Error(`Invalid endpoint kind ${String(endpoint.kind)}`);
  }

  /** Validates connection shape and endpoint compatibility. */
  private validateConnection(connection: GraphConnection, declarations: Map<string, EndpointDeclaration>): void {
    if (!connection || typeof connection !== "object") throw new Error("Connection must be an object");
    this.requireId(connection.id, "Connection ID");
    if (connection.kind === "directed-value") {
      this.requireDeclaredKind(connection.from, "value", declarations);
      this.requireDeclaredKind(connection.to, "value", declarations);
    } else if (connection.kind === "undirected-value") {
      if (!Array.isArray(connection.endpoints) || connection.endpoints.length !== 2) throw new Error("Undirected connection requires two endpoints");
      this.requireDeclaredKind(connection.endpoints[0], "value", declarations);
      this.requireDeclaredKind(connection.endpoints[1], "value", declarations);
      if (connection.endpoints[0] === connection.endpoints[1]) throw new Error("Undirected connection endpoints must differ");
    } else if (connection.kind === "slot-flow") {
      this.requireDeclaredKind(connection.from?.slotId, "slot", declarations);
      this.requireId(connection.from?.output, "Slot output");
      this.requireDeclaredKind(connection.to, "slot", declarations);
    } else {
      throw new Error(`Invalid connection kind ${String((connection as GraphConnection).kind)}`);
    }
  }

  /** Requires a declared endpoint of one kind. */
  private requireDeclaredKind(id: string, kind: EndpointDeclaration["kind"], declarations: Map<string, EndpointDeclaration>): void {
    this.requireId(id, "Endpoint ID");
    const endpoint = declarations.get(id);
    if (!endpoint) throw new Error(`Endpoint ${id} is not declared`);
    if (endpoint.kind !== kind) throw new Error(`Endpoint ${id} must be a ${kind} endpoint`);
  }

  /** Requires a current endpoint of one kind. */
  private requireKind(id: string, kind: EndpointDeclaration["kind"]): EndpointDeclaration {
    this.requireDeclaredKind(id, kind, this.declarations);
    return this.declarations.get(id)!;
  }

  /** Requires a non-empty identifier. */
  private requireId(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
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

  /** Reports whether a connection references one endpoint. */
  private references(connection: GraphConnection, endpointId: string): boolean {
    if (connection.kind === "directed-value") return connection.from === endpointId || connection.to === endpointId;
    if (connection.kind === "undirected-value") return connection.endpoints.includes(endpointId);
    return connection.from.slotId === endpointId || connection.to === endpointId;
  }

  /** Returns connections of one kind in stable ID order. */
  private sortedConnections<Kind extends GraphConnection["kind"]>(kind: Kind): Extract<GraphConnection, { kind: Kind }>[] {
    return [...this.connections.values()]
      .filter((item): item is Extract<GraphConnection, { kind: Kind }> => item.kind === kind)
      .sort(this.byId);
  }

  /** Orders persisted records by stable ID. */
  private byId<Shape extends { id: string }>(left: Shape, right: Shape): number {
    return left.id.localeCompare(right.id);
  }

  /** Detaches a connection, including its nested slot source. */
  private cloneConnection(connection: GraphConnection): GraphConnection {
    if (connection.kind === "slot-flow") return { ...connection, from: { ...connection.from } };
    if (connection.kind === "undirected-value") return { ...connection, endpoints: [...connection.endpoints] as [string, string] };
    return { ...connection };
  }
}
