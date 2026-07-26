import {
  createApiClient,
  createPageApiRepository,
  type PageRepository,
} from "@chulane/rivto-app-shared";

const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

let repository: PageRepository | null = null;

export function getPageRepository(): PageRepository {
  if (!repository) {
    const client = createApiClient({ baseUrl });
    repository = createPageApiRepository(client);
  }
  return repository;
}
