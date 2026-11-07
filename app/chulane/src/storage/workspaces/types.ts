/**
 * Defines storage-independent workspace records, snapshots, and mutation contracts.
 * Repositories provide data without authorizing users; services enforce policy.
 * Transaction-scoped instances preserve atomic authorization and writes.
 */
import type { Membership, Workspace, WorkspaceRole } from "../../domain/workspaces/types.ts";
import type { Pagination } from "../../lib/pagination/types.ts";

export interface WorkspaceSnapshot { workspace: Workspace; members: Membership[] }
export interface WorkspaceRepository {
  /**
   * Loads a workspace and its retained membership snapshot.
   * @param id - Stable record identity.
   * @param includeDeleted - Whether deleted records may be loaded.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  load(id: string, includeDeleted?: boolean): Promise<WorkspaceSnapshot>;
  /**
   * Lists persisted records in stable order.
   * @param userId - User whose membership determines the result.
   * @param deleted - Whether to include deleted workspaces.
   * @param pagination - Optional pagination bounds.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  list(userId: string, deleted: boolean, pagination?: Pagination): Promise<Workspace[]>;
  /**
   * Persists a new record and required associations.
   * @param workspace - Workspace record to persist.
   * @param ownerId - Initial workspace owner.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  insert(workspace: Workspace, ownerId: string): Promise<void>;
  /**
   * Changes an existing workspace’s display name.
   * @param id - Stable record identity.
   * @param name - Validated display name.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  updateName(id: string, name: string): Promise<Workspace>;
  /**
   * Records or clears the deletion marker.
   * @param id - Stable record identity.
   * @param deletedAt - Deletion timestamp or null to restore.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  setDeletedAt(id: string, deletedAt: number | null): Promise<void>;
  /**
   * Adds or updates a workspace membership.
   * @param id - Stable record identity.
   * @param userId - User whose membership determines the result.
   * @param role - Membership role to persist.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  setMember(id: string, userId: string, role: WorkspaceRole): Promise<void>;
  /**
   * Removes an existing workspace membership.
   * @param id - Stable record identity.
   * @param userId - User whose membership determines the result.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  removeMember(id: string, userId: string): Promise<void>;
}
