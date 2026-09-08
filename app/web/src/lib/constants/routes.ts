export const FRONTEND_ROUTES = {
  home: "/",
  journal: "/journal",
  journalDay: (day: string) => `/journal/${day}`,
  projects: "/projects",
  project: (id: string) => `/projects/${id}`,
  page: (id: string) => `/pages/${id}`,
  search: "/search",
} as const;
