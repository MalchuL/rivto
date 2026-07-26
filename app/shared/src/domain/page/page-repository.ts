import type { Page, PageId } from "./page";

export type CreatePageInput = {
  title?: string;
  content?: string;
  parentId?: PageId | null;
};

export type UpdatePageInput = {
  id: PageId;
  title?: string;
  content?: string;
  parentId?: PageId | null;
};

export interface PageRepository {
  list(): Promise<Page[]>;
  get(id: PageId): Promise<Page | null>;
  create(input: CreatePageInput): Promise<Page>;
  update(input: UpdatePageInput): Promise<Page>;
  delete(id: PageId): Promise<void>;
}
