import { getMockDb, SYSTEM_PROJECT_IDS } from "../../lib/mock/db";
import type {
  CreatePageInput,
  Page,
  PageFilter,
  UpdatePageInput,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export const pageService = {
  async list(filter: PageFilter = {}): Promise<Page[]> {
    const db = getMockDb();
    return [...db.pages.values()]
      .filter((page) => {
        if (filter.projectId && page.projectId !== filter.projectId) return false;
        if (filter.kind && page.kind !== filter.kind) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<Page | null> {
    return getMockDb().pages.get(id) ?? null;
  },

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
      content: input.content ?? "<p></p>",
      createdAt: created,
      updatedAt: created,
    };
    db.pages.set(page.id, page);
    return page;
  },

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

  async delete(id: string): Promise<void> {
    const db = getMockDb();
    db.pages.delete(id);
    for (const page of db.pages.values()) {
      if (page.parentPageId === id) {
        db.pages.set(page.id, { ...page, parentPageId: null });
      }
    }
  },

  async search(query: string): Promise<Page[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const db = getMockDb();
    return [...db.pages.values()]
      .filter((page) => {
        if (page.title.toLowerCase().includes(needle)) return true;
        return stripHtml(page.content).toLowerCase().includes(needle);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
};
