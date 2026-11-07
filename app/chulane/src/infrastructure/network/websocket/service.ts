/**
 * Owns portable WebSocket connection state, event subscriptions, and reconnects.
 * No queue or delivery guarantee is implied by send; durable replay belongs to
 * application protocols. Generation checks prevent stale async setup resurrecting
 * a connection after close, and service disposal releases every child connection.
 */
import { waitWithSignal } from "../cancellation.ts";

import type {
  SocketState,
  SocketClose,
  SocketEvents,
  SocketAuth,
  SocketConfig,
} from "./types.ts";

/** Minimal platform bridge; implementations retain native event semantics. */
export interface SocketTransport {
  binaryType: string;
  readonly bufferedAmount: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}
export type SocketConnector<C extends SocketConfig = SocketConfig> = (
  config: C,
) => SocketTransport;

/** Owns managed sockets; platform-specific subclasses choose only the connector. */
export class WebSocketService<C extends SocketConfig = SocketConfig> {
  private readonly connections = new Set<SocketConnection<C>>();
  private readonly lifetime = new AbortController();
  private readonly refreshes = new WeakMap<SocketAuth, Promise<void>>();
  private readonly connector: SocketConnector<C>;
  /**
   * @param connector - Platform socket construction; defaults to the browser API.
   */
  constructor(
    connector: SocketConnector<C> = (config) =>
      new WebSocket(config.url, config.protocols),
  ) {
    this.connector = connector;
  }
  /**
   * @param config - Endpoint, auth, and reconnect policy.
   * @returns An independently disposable connection.
   */
  connect(config: C): SocketConnection<C> {
    if (this.lifetime.signal.aborted)
      throw new Error("WebSocket service disposed");
    const connection = new SocketConnection(
      config,
      this.connector,
      this.refresh,
      () => this.connections.delete(connection),
    );
    this.connections.add(connection);
    return connection;
  }
  /**
   * @param auth - Credential owner.
   * @returns Shared refresh work for this adapter.
   */
  private readonly refresh = (auth: SocketAuth): Promise<void> => {
    let pending = this.refreshes.get(auth);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => auth.refresh(this.lifetime.signal))
        .finally(() => this.refreshes.delete(auth));
      this.refreshes.set(auth, pending);
    }
    return pending;
  };
  /**
   * @returns No value after stopping all connections and credential work.
   */
  dispose(): void {
    this.lifetime.abort();
    for (const connection of this.connections) connection.dispose();
    this.connections.clear();
  }
}

/** Manages one reconnecting endpoint without taking ownership of application messages. */
export class SocketConnection<C extends SocketConfig = SocketConfig> {
  private readonly config: C;
  private readonly connector: SocketConnector<C>;
  private readonly refresh: (auth: SocketAuth) => Promise<void>;
  private readonly release: () => void;
  private readonly lifetime = new AbortController();
  private readonly events = new EventTarget();
  private readonly subscriptions = new Set<() => void>();
  private socket?: SocketTransport;
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private openedAt = 0;
  private authRetried = false;
  private currentState: SocketState = "connecting";
  /**
   * @param config - Immutable endpoint defaults.
   * @param connector - Platform constructor.
   * @param refresh - Shared auth coordinator.
   * @param release - Removes the closed connection.
   */
  constructor(
    config: C,
    connector: SocketConnector<C>,
    refresh: (auth: SocketAuth) => Promise<void>,
    release: () => void,
  ) {
    this.config = { ...config };
    this.connector = connector;
    this.refresh = refresh;
    this.release = release;
    queueMicrotask(() => {
      void this.open();
    });
  }
  /**
   * @returns Current connection state.
   */
  get state(): SocketState {
    return this.currentState;
  }
  /**
   * @returns Bytes buffered by the platform, without implying peer receipt.
   */
  get bufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }
  /**
   * @param type - Event category.
   * @param listener - Consumer callback.
   * @returns Idempotent unsubscribe function.
   */
  on<K extends keyof SocketEvents>(
    type: K,
    listener: (value: SocketEvents[K]) => void,
  ): () => void {
    if (this.lifetime.signal.aborted) return () => {};
    const callback = (event: Event) =>
      listener((event as CustomEvent<SocketEvents[K]>).detail);
    const unsubscribe = () => {
      this.events.removeEventListener(type, callback);
      this.subscriptions.delete(unsubscribe);
    };
    this.events.addEventListener(type, callback);
    this.subscriptions.add(unsubscribe);
    return unsubscribe;
  }
  /**
   * @param type - Event category.
   * @param value - Event payload.
   * @returns No value.
   */
  private emit<K extends keyof SocketEvents>(
    type: K,
    value: SocketEvents[K],
  ): void {
    this.events.dispatchEvent(new CustomEvent(type, { detail: value }));
  }
  /**
   * @param state - New observable state.
   * @returns No value.
   */
  private setState(state: SocketState): void {
    this.currentState = state;
    this.emit("state", state);
  }
  /**
   * @returns Resolves after connection setup; failures become observable events.
   */
  private async open(): Promise<void> {
    if (this.lifetime.signal.aborted) return;
    try {
      const prepared = this.config.auth
        ? await waitWithSignal(
            this.config.auth.prepare(this.lifetime.signal),
            this.lifetime.signal,
          )
        : undefined;
      if (this.lifetime.signal.aborted) return;
      const socket = this.connector({ ...this.config, ...prepared });
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        this.openedAt = Date.now();
        this.setState("open");
      };
      socket.onmessage = (event) => {
        if (typeof event.data === "string" || event.data instanceof ArrayBuffer)
          this.emit("message", event.data);
        else this.emit("error", new Error("Unsupported WebSocket payload"));
      };
      socket.onerror = (error) => this.emit("error", error);
      socket.onclose = (event) => {
        void this.closed(event);
      };
    } catch (error) {
      if (!this.lifetime.signal.aborted) {
        this.emit("error", error);
        this.dispose();
      }
    }
  }
  /**
   * @param event - Peer closure details.
   * @returns Resolves after selecting recovery or terminal cleanup.
   */
  private async closed(event: SocketClose): Promise<void> {
    if (this.lifetime.signal.aborted) return;
    this.detach();
    this.emit("close", event);
    if (this.lifetime.signal.aborted) return;
    try {
      const policy =
        typeof this.config.reconnect === "object" ? this.config.reconnect : {};
      if (
        this.openedAt &&
        Date.now() - this.openedAt >= (policy.stableAfterMs ?? 30_000)
      ) {
        this.attempts = 0;
        this.authRetried = false;
      }
      this.openedAt = 0;
      const auth = this.config.auth;
      const authFailure = auth?.isAuthFailure?.(event) ?? false;
      const retry =
        this.config.reconnect &&
        (authFailure ||
          (policy.shouldReconnect?.(event) ??
            ![1000, 1002, 1003, 1007, 1008, 1009, 1010].includes(event.code)));
      if (!retry || (authFailure && this.authRetried)) {
        this.dispose();
        return;
      }
      this.setState("reconnecting");
      if (authFailure && auth) {
        this.authRetried = true;
        await waitWithSignal(this.refresh(auth), this.lifetime.signal);
      }
      if (this.lifetime.signal.aborted) return;
      const initial = policy.initialDelayMs ?? 500;
      const maximum = policy.maxDelayMs ?? 30_000;
      const delay =
        Math.min(maximum, initial * 2 ** Math.min(this.attempts++, 30)) *
        (0.5 + Math.random() * 0.5);
      this.timer = setTimeout(() => {
        void this.open();
      }, delay);
    } catch (error) {
      if (!this.lifetime.signal.aborted) {
        this.emit("error", error);
        this.dispose();
      }
    }
  }
  /**
   * @param data - Text or binary message.
   * @returns No value; successful send does not acknowledge delivery.
   */
  send(data: string | ArrayBuffer): void {
    if (this.state !== "open" || !this.socket)
      throw new Error("WebSocket is not open");
    this.socket.send(data);
  }
  /**
   * @returns Detached transport for terminal cleanup.
   */
  private detach(): SocketTransport | undefined {
    const socket = this.socket;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    this.socket = undefined;
    return socket;
  }
  /**
   * @param code - Normal or application close code.
   * @param reason - Peer-visible explanation.
   * @returns No value after permanently stopping recovery.
   */
  close(code = 1000, reason = ""): void {
    if (this.lifetime.signal.aborted) return;
    if (code !== 1000 && (code < 3000 || code > 4999))
      throw new Error("Invalid WebSocket close code");
    if (new TextEncoder().encode(reason).length > 123)
      throw new Error("WebSocket close reason is too long");
    this.lifetime.abort();
    clearTimeout(this.timer);
    const socket = this.detach();
    try {
      socket?.close(code, reason);
    } finally {
      this.setState("closed");
      for (const unsubscribe of this.subscriptions) unsubscribe();
      this.release();
    }
  }
  /**
   * @returns No value after closing and releasing subscriptions.
   */
  dispose(): void {
    this.close();
  }
}
