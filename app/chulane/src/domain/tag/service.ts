import { getMockDb } from "../../lib/mock/db";
import type { AvailableTag, CreateTagInput, Tag, UpdateTagInput } from "./types";
import { normalizeTagColor, normalizeTagName } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function ancestorProjectIds(projectId: string): string[] {
  const db = getMockDb();
  const ids: string[] = [];
  let current = db.projects.get(projectId);
  const seen = new Set<string>();
  while (current?.parentProjectId) {
    if (seen.has(current.parentProjectId)) {
      break;
    }
    seen.add(current.parentProjectId);
    ids.push(current.parentProjectId);
    current = db.projects.get(current.parentProjectId);
  }
  return ids;
}

export const tagService = {
  /**
   * Collects project and ancestor tags, sorting local tags first and names alphabetically.
   *
   * @param projectId - Project whose local and inherited tags are requested.
   * @returns Available tags with inheritance metadata, or an empty list for unknown projects.
   */
  async listForProject(projectId: string): Promise<AvailableTag[]> {
    const db = getMockDb();
    const project = db.projects.get(projectId);
    if (!project) {
      return [];
    }

    const ancestorIds = ancestorProjectIds(projectId);
    const result: AvailableTag[] = [];

    for (const tag of db.tags.values()) {
      if (tag.projectId === projectId) {
        result.push({ ...tag, inherited: false });
      } else if (ancestorIds.includes(tag.projectId)) {
        const owner = db.projects.get(tag.projectId);
        result.push({
          ...tag,
          inherited: true,
          ownerProjectName: owner?.name,
        });
      }
    }

    return result.sort((a, b) => {
      if (a.inherited !== b.inherited) {
        return a.inherited ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Looks up a tag in the mock database.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Stored tag, or null when the ID is unknown.
   */
  async get(id: string): Promise<Tag | null> {
    return getMockDb().tags.get(id) ?? null;
  },

  /**
   * Creates a project tag after normalizing its name and color and checking project-local uniqueness.
   *
   * @param input - Creation or update fields for this operation.
   * @returns Stored tag with a new ID and timestamps.
   * @throws If the project is unknown or the name is blank, contains #, or duplicates a project tag.
   */
  async create(input: CreateTagInput): Promise<Tag> {
    const db = getMockDb();
    if (!db.projects.has(input.projectId)) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const name = normalizeTagName(input.name);
    if (!name) {
      throw new Error("Tag name is required");
    }
    if (name.includes("#")) {
      throw new Error("Tag name cannot contain #");
    }
    const duplicate = [...db.tags.values()].some(
      (tag) => tag.projectId === input.projectId && tag.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`Tag #${name} already exists in this project`);
    }
    const created = nowIso();
    const tag: Tag = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      name,
      description: input.description?.trim() || undefined,
      color: normalizeTagColor(input.color),
      createdAt: created,
      updatedAt: created,
    };
    db.tags.set(tag.id, tag);
    return tag;
  },

  /**
   * Updates supplied tag fields, validating a changed name and refreshing the timestamp.
   *
   * @param input - Creation or update fields for this operation.
   * @returns Updated tag.
   * @throws If the tag is unknown or its new name is blank, contains #, or duplicates a project tag.
   */
  async update(input: UpdateTagInput): Promise<Tag> {
    const db = getMockDb();
    const existing = db.tags.get(input.id);
    if (!existing) {
      throw new Error(`Tag not found: ${input.id}`);
    }
    let name = existing.name;
    if (input.name !== undefined) {
      name = normalizeTagName(input.name);
      if (!name) {
        throw new Error("Tag name is required");
      }
      if (name.includes("#")) {
        throw new Error("Tag name cannot contain #");
      }
      const duplicate = [...db.tags.values()].some(
        (tag) =>
          tag.id !== existing.id &&
          tag.projectId === existing.projectId &&
          tag.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        throw new Error(`Tag #${name} already exists in this project`);
      }
    }
    const updated: Tag = {
      ...existing,
      name,
      ...(input.description !== undefined
        ? { description: input.description.trim() || undefined }
        : {}),
      ...(input.color !== undefined ? { color: normalizeTagColor(input.color) } : {}),
      updatedAt: nowIso(),
    };
    db.tags.set(updated.id, updated);
    return updated;
  },

  /**
   * Deletes a tag and removes its ID from every page; missing tags are ignored.
   *
   * @param id - Stable ID of the record or registration to access.
   */
  async delete(id: string): Promise<void> {
    const db = getMockDb();
    if (!db.tags.has(id)) {
      return;
    }
    db.tags.delete(id);
    for (const page of db.pages.values()) {
      if (page.tagIds.includes(id)) {
        db.pages.set(page.id, {
          ...page,
          tagIds: page.tagIds.filter((tagId) => tagId !== id),
          updatedAt: nowIso(),
        });
      }
    }
  },
};
