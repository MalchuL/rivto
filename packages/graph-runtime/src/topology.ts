/**
 * Pure topology helpers shared by connection management and execution.
 * This module owns shape compatibility, stable ordering, endpoint references,
 * and transitive undirected value-component traversal.
 */
import type { GraphConnection } from "./connections";
import type { EndpointDeclaration } from "./endpoints";

/** Validates a portable endpoint declaration. */
export function validateEndpoint(endpoint: EndpointDeclaration): void {
  if (!endpoint || typeof endpoint !== "object") throw new Error("Endpoint must be an object");
  requireId(endpoint.id, "Endpoint ID");
  requireId(endpoint.nodeId, "Node ID");
  if (endpoint.kind !== "value" && endpoint.kind !== "slot") throw new Error(`Invalid endpoint kind ${String(endpoint.kind)}`);
}

/** Validates connection shape and endpoint compatibility. */
export function validateConnection(connection: GraphConnection, declarations: Map<string, EndpointDeclaration>): void {
  if (!connection || typeof connection !== "object") throw new Error("Connection must be an object");
  requireId(connection.id, "Connection ID");
  if (connection.kind === "directed-value") {
    requireDeclaredKind(connection.from, "value", declarations);
    requireDeclaredKind(connection.to, "value", declarations);
  } else if (connection.kind === "undirected-value") {
    if (!Array.isArray(connection.endpoints) || connection.endpoints.length !== 2) throw new Error("Undirected connection requires two endpoints");
    requireDeclaredKind(connection.endpoints[0], "value", declarations);
    requireDeclaredKind(connection.endpoints[1], "value", declarations);
    if (connection.endpoints[0] === connection.endpoints[1]) throw new Error("Undirected connection endpoints must differ");
  } else if (connection.kind === "slot-flow") {
    requireDeclaredKind(connection.from?.slotId, "slot", declarations);
    requireId(connection.from?.output, "Slot output");
    requireDeclaredKind(connection.to, "slot", declarations);
  } else {
    throw new Error(`Invalid connection kind ${String((connection as GraphConnection).kind)}`);
  }
}

/** Requires a declared endpoint of one kind. */
export function requireDeclaredKind(
  id: string,
  kind: EndpointDeclaration["kind"],
  declarations: Map<string, EndpointDeclaration>,
): void {
  requireId(id, "Endpoint ID");
  const endpoint = declarations.get(id);
  if (!endpoint) throw new Error(`Endpoint ${id} is not declared`);
  if (endpoint.kind !== kind) throw new Error(`Endpoint ${id} must be a ${kind} endpoint`);
}

/** Requires a non-empty identifier. */
export function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
}

/** Reports whether a connection references one endpoint. */
export function referencesEndpoint(connection: GraphConnection, endpointId: string): boolean {
  if (connection.kind === "directed-value") return connection.from === endpointId || connection.to === endpointId;
  if (connection.kind === "undirected-value") return connection.endpoints.includes(endpointId);
  return connection.from.slotId === endpointId || connection.to === endpointId;
}

/** Returns connections of one kind in stable ID order. */
export function connectionsOfKind<Kind extends GraphConnection["kind"]>(
  connections: Iterable<GraphConnection>,
  kind: Kind,
): Extract<GraphConnection, { kind: Kind }>[] {
  return [...connections]
    .filter((item): item is Extract<GraphConnection, { kind: Kind }> => item.kind === kind)
    .sort(compareById);
}

/** Finds a transitive undirected value component in stable endpoint order. */
export function valueComponent(start: string, connections: Iterable<GraphConnection>): string[] {
  const found = new Set([start]);
  const queue = [start];
  const edges = connectionsOfKind(connections, "undirected-value");
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

/** Orders persisted records by stable ID. */
export function compareById<Shape extends { id: string }>(left: Shape, right: Shape): number {
  return left.id.localeCompare(right.id);
}

/** Detaches a connection, including its nested or tuple fields. */
export function cloneConnection(connection: GraphConnection): GraphConnection {
  if (connection.kind === "slot-flow") return { ...connection, from: { ...connection.from } };
  if (connection.kind === "undirected-value") return { ...connection, endpoints: [...connection.endpoints] as [string, string] };
  return { ...connection };
}
