/**
 * Validates and clones portable graph topology at the persistence boundary.
 * Parsing finishes before callers replace live topology, preventing partial loads.
 */
import type { GraphConnection } from "./connections";
import type { EndpointDeclaration } from "./endpoints";
import { cloneConnection, validateConnection, validateEndpoint } from "./topology";

export const GRAPH_SNAPSHOT_VERSION = 1 as const;

/** Portable topology without runtime values or executable handlers. */
export interface GraphSnapshot {
  version: typeof GRAPH_SNAPSHOT_VERSION;
  endpoints: EndpointDeclaration[];
  connections: GraphConnection[];
}

/** Parses a complete snapshot without mutating runtime state. */
export function parseGraphSnapshot(input: unknown): GraphSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Graph snapshot must be an object");
  const raw = input as Partial<GraphSnapshot>;
  if (raw.version !== GRAPH_SNAPSHOT_VERSION) throw new Error(`Unsupported graph snapshot version ${String(raw.version)}`);
  if (!Array.isArray(raw.endpoints) || !Array.isArray(raw.connections)) throw new Error("Graph snapshot arrays are required");
  const endpoints = raw.endpoints.map((item) => ({ ...item }));
  const declarations = new Map<string, EndpointDeclaration>();
  endpoints.forEach((endpoint) => {
    validateEndpoint(endpoint);
    if (declarations.has(endpoint.id)) throw new Error(`Duplicate endpoint ${endpoint.id}`);
    declarations.set(endpoint.id, endpoint);
  });
  const connections = raw.connections.map((item) => cloneConnection(item));
  const ids = new Set<string>();
  connections.forEach((connection) => {
    validateConnection(connection, declarations);
    if (ids.has(connection.id)) throw new Error(`Duplicate connection ${connection.id}`);
    ids.add(connection.id);
  });
  return { version: GRAPH_SNAPSHOT_VERSION, endpoints, connections };
}
