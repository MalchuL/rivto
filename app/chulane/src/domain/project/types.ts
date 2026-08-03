export type SystemContainer =
  | "inbox"
  | "journal"
  | "templates"
  | "archive"
  | "trash";

export type ProjectStatus = "active" | "paused" | "done" | "archived";

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cover?: string;
  status?: ProjectStatus;
  properties: Record<string, unknown>;
  /** Nested projects inherit tags from ancestors. */
  parentProjectId: string | null;
  /** Set for built-in containers (Inbox, Journal, …); null for user projects. */
  system: SystemContainer | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateProjectInput = {
  name?: string;
  description?: string;
  icon?: string;
  status?: ProjectStatus;
  parentProjectId?: string | null;
};

export type UpdateProjectInput = {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  status?: ProjectStatus;
  parentProjectId?: string | null;
  properties?: Record<string, unknown>;
};
