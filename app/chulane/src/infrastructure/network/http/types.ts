/**
 * Describes HTTP request, response, and authentication contracts independent
 * of Axios. These types are shared by browser and runtime clients.
 */
/** Decoded payload plus platform-native response metadata. */
export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}
/** Credential owner shared by clients that use the same identity. */
export interface HttpAuth {
  /** Supplies current credentials without mutating another client's defaults.
   * @param signal - Request cancellation signal.
   * @returns Headers applied after client and request headers.
   */
  prepare(signal: AbortSignal): Promise<Record<string, string>>;
  /** Renews credentials for subsequent requests.
   * @param signal - Service lifetime, shared across refresh waiters.
   * @returns Resolves once fresh credentials are available.
   */
  refresh(signal: AbortSignal): Promise<void>;
  /** Identifies provider-specific authentication rejection.
   * @param response - Response metadata and raw body before JSON decoding.
   * @returns Whether credentials should be refreshed; defaults to status 401.
   */
  isAuthFailure?(response: HttpResponse<unknown>): boolean;
}
export interface HttpConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeoutMs?: number;
  auth?: HttpAuth;
}
export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<
    string,
    string | number | boolean | readonly (string | number | boolean)[]
  >;
  body?: unknown;
  responseType?: "json" | "text" | "arraybuffer";
  signal?: AbortSignal;
  timeoutMs?: number;
  retryAfterRefresh?: boolean;
}
export type HttpErrorKind =
  "http" | "network" | "timeout" | "cancelled" | "decode";

/** An SSE event after text framing, before application-level decoding. */
export interface SseEvent {
  event: string;
  data: string;
  id: string;
  retry?: number;
}
