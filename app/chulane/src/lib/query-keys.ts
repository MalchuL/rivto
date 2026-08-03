import type { PageFilter } from "../domain/page/types";

export const QUERY_KEYS = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", "detail", id] as const,
  pages: ["pages"] as const,
  pageList: (filter: PageFilter = {}) =>
    ["pages", "list", filter.projectId ?? null, filter.kind ?? null] as const,
  page: (id: string) => ["pages", "detail", id] as const,
  pageSearch: (query: string) => ["pages", "search", query] as const,
  journalDays: ["pages", "journal-days"] as const,
  journalDay: (day: string) => ["pages", "journal-day", day] as const,
  projectTags: (projectId: string) => ["tags", "project", projectId] as const,
};
