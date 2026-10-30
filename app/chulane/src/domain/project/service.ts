import { getMockDb } from "../../lib/mock/db";
import type { CreateProjectInput, Project, UpdateProjectInput } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export const projectService = {
  /**
   * Lists mock projects in ascending creation order.
   *
   * @returns All stored projects.
   */
  async list(): Promise<Project[]> {
    const db = getMockDb();
    return [...db.projects.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * Looks up a project in the mock database.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Stored project, or null when the ID is unknown.
   */
  async get(id: string): Promise<Project | null> {
    return getMockDb().projects.get(id) ?? null;
  },

  /**
   * Creates a mock project with a new ID, timestamps, and defaults for omitted fields.
   *
   * @param input - Creation or update fields for this operation.
   * @returns The project stored in the mock database.
   */
  async create(input: CreateProjectInput = {}): Promise<Project> {
    const db = getMockDb();
    const created = nowIso();
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name?.trim() || "Untitled project",
      description: input.description,
      icon: input.icon,
      status: input.status ?? "active",
      properties: {},
      parentProjectId: input.parentProjectId ?? null,
      system: null,
      createdAt: created,
      updatedAt: created,
    };
    db.projects.set(project.id, project);
    return project;
  },

  /**
   * Applies supplied project fields and refreshes the update timestamp.
   *
   * @param input - Creation or update fields for this operation.
   * @returns Updated project.
   * @throws If the project ID is unknown.
   */
  async update(input: UpdateProjectInput): Promise<Project> {
    const db = getMockDb();
    const existing = db.projects.get(input.id);
    if (!existing) {
      throw new Error(`Project not found: ${input.id}`);
    }
    const updated: Project = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name.trim() || existing.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.parentProjectId !== undefined ? { parentProjectId: input.parentProjectId } : {}),
      ...(input.properties !== undefined ? { properties: input.properties } : {}),
      updatedAt: nowIso(),
    };
    db.projects.set(updated.id, updated);
    return updated;
  },

  /**
   * Deletes a project, its pages and tags, and reparents child projects to its parent; missing IDs are ignored.
   *
   * @param id - Stable ID of the record or registration to access.
   * @throws If the project is a system container.
   */
  async delete(id: string): Promise<void> {
    const db = getMockDb();
    const project = db.projects.get(id);
    if (!project) {
      return;
    }
    if (project.system) {
      throw new Error("System containers cannot be deleted");
    }
    // Re-parent children to this project's parent.
    for (const child of db.projects.values()) {
      if (child.parentProjectId === id) {
        db.projects.set(child.id, {
          ...child,
          parentProjectId: project.parentProjectId,
          updatedAt: nowIso(),
        });
      }
    }
    db.projects.delete(id);
    for (const page of [...db.pages.values()]) {
      if (page.projectId === id) {
        db.pages.delete(page.id);
      }
    }
    for (const tag of [...db.tags.values()]) {
      if (tag.projectId === id) {
        db.tags.delete(tag.id);
      }
    }
  },
};
