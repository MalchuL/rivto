import { EMPTY_EDITOR_CONTENT, extractPageText } from "../../editor/snapshot";
import { getMockDb, SYSTEM_PROJECT_IDS } from "../../lib/mock/db";
import type { CreatePageInput, Page, PageFilter, UpdatePageInput } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export const pageService = {
  /**
   * Lists mock pages matching the optional project and kind filters, newest update first.
   *
   * @param filter - Optional project and page-kind filters; omitted fields do not restrict results.
   * @returns Matching pages; omitted filters include all pages.
   */
  async list(filter: PageFilter = {}): Promise<Page[]> {
    const db = getMockDb();
    return [...db.pages.values()]
      .filter((page) => {
        if (filter.projectId && page.projectId !== filter.projectId) {
          return false;
        }
        if (filter.kind && page.kind !== filter.kind) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /**
   * Looks up a page in the mock database.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Stored page, or null when the ID is unknown.
   */
  async get(id: string): Promise<Page | null> {
    return getMockDb().pages.get(id) ?? null;
  },

  /**
   * Creates a mock page with a new ID and timestamps; omitted project and title use the inbox and Untitled.
   *
   * @param input - Creation or update fields for this operation.
   * @returns The page stored in the mock database.
   */
  async create(input: CreatePageInput = {}): Promise<Page> {
    const db = getMockDb();
    const created = nowIso();
    const page: Page = {
      id: crypto.randomUUID(),
      projectId: input.projectId ?? SYSTEM_PROJECT_IDS.inbox,
      title: input.title?.trim() || "Untitled",
      parentPageId: input.parentPageId ?? null,
      kind: input.kind ?? "page",
      tagIds: input.tagIds ?? [],
      properties: input.properties ?? {},
      content: input.content ?? EMPTY_EDITOR_CONTENT,
      createdAt: created,
      updatedAt: created,
    };
    db.pages.set(page.id, page);
    return page;
  },

  /**
   * Applies supplied page fields and refreshes the update timestamp without changing its ID.
   *
   * @param input - Creation or update fields for this operation.
   * @returns Updated page.
   * @throws If the page ID is unknown.
   */
  async update(input: UpdatePageInput): Promise<Page> {
    const db = getMockDb();
    const existing = db.pages.get(input.id);
    if (!existing) {
      throw new Error(`Page not found: ${input.id}`);
    }
    const { id: _id, ...patch } = input;
    const updated: Page = {
      ...existing,
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() || "Untitled" } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.parentPageId !== undefined ? { parentPageId: patch.parentPageId } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.tagIds !== undefined ? { tagIds: patch.tagIds } : {}),
      ...(patch.properties !== undefined ? { properties: patch.properties } : {}),
      updatedAt: nowIso(),
    };
    db.pages.set(updated.id, updated);
    return updated;
  },

  /**
   * Deletes a mock page and makes its direct children root pages; missing IDs are ignored.
   *
   * @param id - Stable ID of the record or registration to access.
   */
  async delete(id: string): Promise<void> {
    const db = getMockDb();
    db.pages.delete(id);
    for (const page of db.pages.values()) {
      if (page.parentPageId === id) {
        db.pages.set(page.id, { ...page, parentPageId: null });
      }
    }
  },

  /**
   * Searches page titles and extracted content case-insensitively, newest update first.
   *
   * @param query - Text to match against page titles and extracted content.
   * @returns Matching pages, or an empty list for blank queries.
   */
  async search(query: string): Promise<Page[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const db = getMockDb();
    return [...db.pages.values()]
      .filter((page) => {
        if (page.title.toLowerCase().includes(needle)) {
          return true;
        }
        return extractPageText(page.content).toLowerCase().includes(needle);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
};
