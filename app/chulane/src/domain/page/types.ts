export type PageKind =
  | "page"
  | "journal"
  | "project-home"
  | "database"
  | "canvas";

export interface Page {
  id: string;
  projectId: string;
  title: string;
  icon?: string;
  cover?: string;
  parentPageId?: string | null;
  kind: PageKind;
  /** References Tag.id from the project (or ancestor) vocabulary. */
  tagIds: string[];
  properties: Record<string, unknown>;
  /** TipTap HTML for V1; later replaced by Rivto block content. */
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type PageFilter = {
  projectId?: string;
  kind?: PageKind;
};

export type CreatePageInput = {
  projectId?: string;
  title?: string;
  kind?: PageKind;
  parentPageId?: string | null;
  content?: string;
  tagIds?: string[];
  properties?: Record<string, unknown>;
};

export type UpdatePageInput = {
  id: string;
  projectId?: string;
  title?: string;
  icon?: string;
  parentPageId?: string | null;
  content?: string;
  tagIds?: string[];
  properties?: Record<string, unknown>;
};
