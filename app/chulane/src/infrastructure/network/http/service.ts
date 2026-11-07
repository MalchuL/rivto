/**
 * Owns configured Axios clients without leaking Axios contracts to consumers.
 * Each client isolates credentials and owns cancellation through response-body
 * completion; the service coordinates refreshes and disposes all child clients.
 */
import axios from "axios";
import { waitWithSignal } from "../cancellation.ts";

import type {
  HttpAuth,
  HttpConfig,
  HttpOptions,
  HttpResponse,
  HttpErrorKind,
} from "./types.ts";

/** Normalizes transport failures while retaining their original evidence. */
export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly response?: HttpResponse<unknown>;
  /**
   * @param kind - Failure category.
   * @param message - Explanation.
   * @param cause - Original failure.
   * @param response - Rejected response metadata.
   */
  constructor(
    kind: HttpErrorKind,
    message: string,
    cause?: unknown,
    response?: HttpResponse<unknown>,
  ) {
    super(message, { cause });
    this.name = "HttpError";
    this.kind = kind;
    this.response = response;
  }
}

/** Creates isolated clients and owns refresh work shared by an auth adapter. */
export class HttpService {
  private readonly clients = new Set<HttpClient>();
  private readonly refreshes = new WeakMap<HttpAuth, Promise<void>>();
  private readonly lifetime = new AbortController();
  /**
   * @param config - Endpoint defaults.
   * @returns A client owned by this service.
   */
  create(config: HttpConfig): HttpClient {
    if (this.lifetime.signal.aborted) throw new Error("HTTP service disposed");
    const client = new HttpClient(config, this.refresh, () =>
      this.clients.delete(client),
    );
    this.clients.add(client);
    return client;
  }
  /**
   * @param auth - Identity of the credential owner.
   * @returns The shared refresh result.
   */
  private readonly refresh = (auth: HttpAuth): Promise<void> => {
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
   * @returns No value after cancelling all owned work.
   */
  dispose(): void {
    this.lifetime.abort();
    for (const client of this.clients) client.dispose();
    this.clients.clear();
  }
}

/** Performs requests and owns their active bodies until completion or cancellation. */
export class HttpClient {
  private readonly instance = axios.create({
    adapter: "fetch",
    validateStatus: () => true,
  });
  private readonly active = new Set<AbortController>();
  private disposed = false;
  private readonly config: HttpConfig;
  private readonly refresh: (auth: HttpAuth) => Promise<void>;
  private readonly release: () => void;
  /**
   * @param config - Endpoint defaults.
   * @param refresh - Service refresh coordinator.
   * @param release - Removes the disposed client.
   */
  constructor(
    config: HttpConfig,
    refresh: (auth: HttpAuth) => Promise<void>,
    release: () => void,
  ) {
    this.config = { ...config, headers: { ...config.headers } };
    this.refresh = refresh;
    this.release = release;
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Decoded data and metadata.
   */
  request<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.execute<T>(url, options, false);
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns A cancellable byte stream and metadata.
   */
  stream(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<ReadableStream<Uint8Array>>> {
    return this.execute(url, options, true);
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @param streaming - Whether ownership extends to body consumption.
   * @returns Response data and metadata.
   */
  private async execute<T>(
    url: string,
    options: HttpOptions,
    streaming: boolean,
  ): Promise<HttpResponse<T>> {
    if (this.disposed) throw new Error("HTTP client disposed");
    const base = new URL(
      this.config.baseUrl,
      typeof location === "undefined" ? undefined : location.href,
    );
    const target = new URL(url, base);
    const configuredHeaders = new Headers({
      ...this.config.headers,
      ...options.headers,
    });
    const authenticated =
      Boolean(this.config.auth) ||
      this.config.credentials === "include" ||
      ["authorization", "cookie", "proxy-authorization"].some((name) =>
        configuredHeaders.has(name),
      );
    if (authenticated && target.origin !== base.origin)
      throw new Error("Authenticated request cannot override origin");
    for (const [key, value] of Object.entries(options.query ?? {})) {
      for (const item of Array.isArray(value) ? value : [value])
        target.searchParams.append(key, String(item));
    }
    const controller = new AbortController();
    this.active.add(controller);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    let bodyOwned = false;
    let timedOut = false;
    let headerTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      this.active.delete(controller);
    };
    try {
      const method = (options.method ?? "GET").toUpperCase();
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        const prepared = this.config.auth
          ? await waitWithSignal(this.config.auth.prepare(signal), signal)
          : undefined;
        signal.throwIfAborted();
        const timeout = options.timeoutMs ?? this.config.timeoutMs ?? 30_000;
        if (streaming && timeout > 0)
          headerTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeout);
        const response = await this.instance.request({
          url: target.href,
          method,
          data: options.body,
          signal,
          headers: { ...this.config.headers, ...options.headers, ...prepared },
          responseType: streaming
            ? "stream"
            : options.responseType === "arraybuffer"
              ? "arraybuffer"
              : "text",
          timeout: streaming ? 0 : timeout,
          fetchOptions: {
            credentials: this.config.credentials ?? "same-origin",
            redirect: authenticated ? "error" : "follow",
          },
        });
        clearTimeout(headerTimer);
        // HEAD and 204 responses have no platform body but still expose a usable stream.
        if (streaming && response.data == null) {
          response.data = new ReadableStream<Uint8Array>({
            start(destination) {
              destination.close();
            },
          });
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers))
          if (value != null) headers.set(key, String(value));
        const result: HttpResponse<unknown> = {
          data: response.data,
          status: response.status,
          headers,
        };
        const auth = this.config.auth;
        const rejected =
          auth && (auth.isAuthFailure?.(result) ?? result.status === 401);
        const retryable =
          options.retryAfterRefresh ?? (method === "GET" || method === "HEAD");
        if (rejected && retryable && attempt === 0) {
          if (streaming) await (response.data as ReadableStream).cancel();
          await waitWithSignal(this.refresh(auth), signal);
          continue;
        }
        if (rejected || result.status < 200 || result.status >= 300) {
          if (streaming) {
            await (response.data as ReadableStream).cancel();
            result.data = undefined;
          }
          throw new HttpError(
            "http",
            `HTTP ${result.status}`,
            undefined,
            result,
          );
        }
        if (streaming) {
          const reader = (
            response.data as ReadableStream<Uint8Array>
          ).getReader();
          result.data = new ReadableStream<Uint8Array>({
            async pull(destination) {
              try {
                const chunk = await reader.read();
                if (chunk.done) {
                  cleanup();
                  destination.close();
                } else destination.enqueue(chunk.value);
              } catch (error) {
                cleanup();
                destination.error(
                  new HttpError(
                    signal.aborted ? "cancelled" : "network",
                    "Response stream failed",
                    error,
                  ),
                );
              }
            },
            async cancel(reason) {
              controller.abort(reason);
              try {
                await reader.cancel(reason);
              } finally {
                cleanup();
              }
            },
          });
          bodyOwned = true;
        } else if (
          (options.responseType ?? "json") === "json" &&
          method !== "HEAD" &&
          result.status !== 204 &&
          result.data !== ""
        ) {
          try {
            result.data = JSON.parse(result.data as string);
          } catch (error) {
            throw new HttpError(
              "decode",
              "Invalid JSON response",
              error,
              result,
            );
          }
        }
        return result as HttpResponse<T>;
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const kind = timedOut
        ? "timeout"
        : signal.aborted
          ? "cancelled"
          : axios.isAxiosError(error) &&
              ["ETIMEDOUT", "ECONNABORTED"].includes(error.code ?? "")
            ? "timeout"
            : "network";
      throw new HttpError(
        kind,
        kind === "cancelled" ? "Request cancelled" : "Request failed",
        error,
      );
    } finally {
      clearTimeout(headerTimer);
      if (!bodyOwned) {
        controller.abort();
        cleanup();
      }
    }
  }
  /**
   * @returns No value after cancelling active requests and streams.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.active) controller.abort();
    this.active.clear();
    this.release();
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  get<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  post<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "POST" });
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  put<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "PUT" });
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  patch<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "PATCH" });
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  delete<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "DELETE" });
  }
  /**
   * @param url - Endpoint path.
   * @param options - Request settings.
   * @returns Response data and metadata.
   */
  head<T = unknown>(
    url: string,
    options: HttpOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "HEAD" });
  }
}
