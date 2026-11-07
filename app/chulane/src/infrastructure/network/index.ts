/** Browser-safe network entry point; runtime construction lives in websocket/node.ts and plugin.ts. */
export { HttpService, HttpClient, HttpError } from "./http/service.ts";
export type {
  HttpConfig,
  HttpAuth,
  HttpOptions,
  HttpResponse,
  HttpErrorKind,
} from "./http/types.ts";
export { WebSocketService, SocketConnection } from "./websocket/service.ts";
export type {
  SocketConfig,
  SocketAuth,
  SocketState,
  SocketEvents,
  SocketClose,
  ReconnectOptions,
} from "./websocket/types.ts";
export { parseSse } from "./http/sse.ts";
export type { SseEvent } from "./http/types.ts";
