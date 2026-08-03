const DEFAULT_API_BASE_URL = "http://127.0.0.1:4000";

export type RuntimeConfig = {
  publicApiBaseUrl: string;
};

declare global {
  interface Window {
    __APP_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

/**
 * Browser-reachable API origin. Resolved server-side at request time from
 * PUBLIC_API_BASE_URL and injected into the HTML, so the same build can be
 * pointed at a different backend without rebuilding.
 *
 * The V1 mock storage does not call it, but service clients should use this
 * once a real backend is wired in.
 */
export function getPublicApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  }
  return window.__APP_RUNTIME_CONFIG__?.publicApiBaseUrl ?? DEFAULT_API_BASE_URL;
}

/** Inline script injected by the root layout before client JS runs. */
export function getRuntimeConfigScript(): string {
  const config: RuntimeConfig = {
    publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  };
  return `window.__APP_RUNTIME_CONFIG__ = ${JSON.stringify(config)};`;
}
