/**
 * Provides Node-only WebSocket construction with handshake headers. Browser
 * consumers import index.ts instead, so ws and Node builtins never enter UI bundles.
 */
import WebSocket from "ws";
import { WebSocketService, type SocketTransport } from "./service.ts";
import type { NodeSocketConfig } from "./types.ts";
export type { NodeSocketConfig } from "./types.ts";
/** Runtime service supporting provider authentication through HTTP upgrade headers. */
export class NodeWebSocketService extends WebSocketService<NodeSocketConfig> {
  /** Constructs the runtime platform bridge without opening a connection. */
  constructor() {
    super((config) => {
      const socket = new WebSocket(config.url, config.protocols, {
        headers: config.headers,
        handshakeTimeout: config.handshakeTimeoutMs ?? 30_000,
      });
      // ws emits an error when close interrupts CONNECTING, even after handlers detach.
      socket.on("error", () => {});
      return socket as unknown as SocketTransport;
    });
  }
}
