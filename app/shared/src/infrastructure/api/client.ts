import type {
  CreatePageRequest,
  ListPagesResponse,
  PageDto,
  UpdatePageRequest,
} from "../../application/page/page-dto";

export type ApiClientConfig = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  config: ApiClientConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const response = await fetchImpl(new URL(path, config.baseUrl).toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Typed HTTP client matching the Encore `page` service.
 * Replace or regenerate via `encore gen client` when the CLI is available.
 */
export function createApiClient(config: ApiClientConfig) {
  return {
    page: {
      list: () => request<ListPagesResponse>(config, "/page", { method: "GET" }),
      get: (id: string) =>
        request<PageDto>(config, `/page/${id}`, { method: "GET" }),
      create: (body: CreatePageRequest = {}) =>
        request<PageDto>(config, "/page", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      update: (id: string, body: UpdatePageRequest) =>
        request<PageDto>(config, `/page/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      delete: (id: string) =>
        request<void>(config, `/page/${id}`, { method: "DELETE" }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
