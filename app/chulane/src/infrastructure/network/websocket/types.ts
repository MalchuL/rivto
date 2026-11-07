/**
 * Declares portable WebSocket events, connection policy, and authentication.
 * Node-only handshake settings are kept distinct from browser options.
 */
export type SocketState = "connecting" | "open" | "reconnecting" | "closed";
export interface SocketClose {
  code: number;
  reason: string;
  wasClean: boolean;
}
export interface SocketEvents {
  state: SocketState;
  message: string | ArrayBuffer;
  error: unknown;
  close: SocketClose;
}
export interface SocketEndpoint {
  url: string;
  protocols?: string[];
}
export interface SocketAuth<C extends SocketEndpoint = SocketEndpoint> {
  /** Prepares fresh connection details, such as a short-lived ticket.
   * @param signal - Connection lifetime.
   * @returns Endpoint overrides for the next handshake.
   */
  prepare(signal: AbortSignal): Promise<Partial<C>>;
  /** Classifies the provider's authentication close codes.
   * @param close - Peer closure metadata.
   * @returns Whether one credential refresh should precede reconnect.
   */
  isAuthFailure?(close: SocketClose): boolean;
  /** Renews credentials across connections sharing this adapter.
   * @param signal - Service lifetime.
   * @returns Resolves when preparation can use fresh credentials.
   */
  refresh(signal: AbortSignal): Promise<void>;
}
export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Time open before retry and authentication budgets reset; defaults to 30 seconds. */
  stableAfterMs?: number;
  /** Overrides the default terminal-close policy for a protocol.
   * @param close - Peer closure metadata.
   * @returns Whether the connection should be retried.
   */
  shouldReconnect?(close: SocketClose): boolean;
}
export interface SocketConfig extends SocketEndpoint {
  auth?: SocketAuth;
  reconnect?: boolean | ReconnectOptions;
}
/** Runtime-only handshake settings supported by the Node WebSocket adapter. */
export interface NodeSocketConfig extends SocketConfig {
  headers?: Record<string, string>;
  /** Handshake timeout in milliseconds; zero disables it. Defaults to 30 seconds. */
  handshakeTimeoutMs?: number;
  auth?: SocketAuth<NodeSocketConfig>;
}
