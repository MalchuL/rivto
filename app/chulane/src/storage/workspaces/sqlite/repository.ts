/**
 * Implements workspace and membership persistence through the repository contract.
 * Maps SQLite records into domain values without deciding caller authorization.
 * The supplied connection may be shared with identity inside one transaction.
 */
import { and, asc, eq, getTableColumns, isNull, isNotNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Workspace, WorkspaceRole } from "../../../domain/workspaces/types.ts";
import type { Pagination } from "../../../lib/pagination/types.ts";
import type { WorkspaceRepository } from "../types.ts";
import { loadWorkspace } from "../../sqlite/queries.ts";
import * as schema from "../../sqlite/schema.ts";

type Database = Pick<LibSQLDatabase<typeof schema>, "select" | "insert" | "update" | "delete">;
const { workspaces, memberships } = schema;
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly db: Database;
  /**
   * Connects the dependencies required by this instance.
   * @param db - SQLite connection or active transaction.
   */
  constructor(db: Database) { this.db = db; }
  /**
   * Loads a workspace and its authorization snapshot.
   * @param id - Stable identity of the requested record.
   * @param includeDeleted - Whether lifecycle operations may load deleted records.
   * @returns The requested result after the operation completes.
   */
  async load(id: string, includeDeleted = false) { return loadWorkspace(this.db, id, includeDeleted); }
  /**
   * Lists matching persisted records in stable order.
   * @param userId - Stable user identity.
   * @param deleted - Whether to select or mark deleted records.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async list(userId: string, deleted: boolean, pagination?: Pagination) {
    const query = this.db.select(getTableColumns(workspaces)).from(workspaces)
      .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
      .where(and(eq(memberships.userId, userId), deleted ? eq(memberships.role, "owner") : undefined,
        deleted ? isNotNull(workspaces.deletedAt) : isNull(workspaces.deletedAt)))
      .orderBy(asc(workspaces.name), asc(workspaces.id));
    if (pagination) query.limit(pagination.limit).offset(pagination.offset);
    return query;
  }
  /**
   * Persists a new record and its required associations.
   * @param workspace - Workspace record to persist.
   * @param ownerId - Identity of the initial workspace owner.
   * @returns The requested result after the operation completes.
   */
  async insert(workspace: Workspace, ownerId: string) {
    await this.db.insert(workspaces).values(workspace);
    await this.db.insert(memberships).values({ workspaceId: workspace.id, userId: ownerId, role: "owner" });
  }
  /**
   * Persists the validated workspace display name.
   * @param id - Stable identity of the requested record.
   * @param name - Validated display name.
   * @returns The requested result after the operation completes.
   */
  async updateName(id: string, name: string) { return (await this.db.update(workspaces).set({ name }).where(eq(workspaces.id, id)).returning().get())!; }
  /**
   * Persists the workspace lifecycle marker.
   * @param id - Stable identity of the requested record.
   * @param deletedAt - Deletion timestamp, or null to restore the workspace.
   * @returns The requested result after the operation completes.
   */
  async setDeletedAt(id: string, deletedAt: number | null) { await this.db.update(workspaces).set({ deletedAt }).where(eq(workspaces.id, id)); }
  /**
   * Persists the requested workspace membership role.
   * @param id - Stable identity of the requested record.
   * @param userId - Stable user identity.
   * @param role - Membership role to persist.
   * @returns The requested result after the operation completes.
   */
  async setMember(id: string, userId: string, role: WorkspaceRole) {
    await this.db.insert(memberships).values({ workspaceId: id, userId, role })
      .onConflictDoUpdate({ target: [memberships.workspaceId, memberships.userId], set: { role } });
  }
  /**
   * Removes the requested workspace membership.
   * @param id - Stable identity of the requested record.
   * @param userId - Stable user identity.
   * @returns The requested result after the operation completes.
   */
  async removeMember(id: string, userId: string) { await this.db.delete(memberships).where(and(eq(memberships.workspaceId, id), eq(memberships.userId, userId))); }
}
