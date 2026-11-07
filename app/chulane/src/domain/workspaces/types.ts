/**
 * Defines workspace data and operations for a caller-bound service instance.
 * Every workspace can have members; access requires an appropriate role.
 * Implementations enforce current membership and lifecycle rules atomically.
 */
import type { Pagination } from "../../lib/pagination/index.ts";

export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspacePermission = "read" | "write" | "manage";
export interface Workspace {
  id: string;
  name: string;
  /** UTC epoch milliseconds for recoverable deletion; null denotes an active workspace. */
  deletedAt: number | null;
}
/** Editable settings; identity and deletion use dedicated operations. */
export interface WorkspaceUpdate { name: string }
export interface Membership { userId: string; role: WorkspaceRole }

export interface WorkspaceService {
  /**
   * Creates a workspace with the current user as its first owner.
   * @param name - Nonempty workspace display name.
   * @returns The persisted workspace.
   */
  create(name: string): Promise<Workspace>;
  /**
   * Lists active workspaces accessible to the current user.
   * @param pagination - Optional bounds applied after access filtering.
   * @returns Accessible workspaces in stable display order.
   */
  listAccessible(pagination?: Pagination): Promise<Workspace[]>;
  /**
   * Loads workspace metadata after authorizing read access.
   * @param workspaceId - Requested workspace.
   * @returns Authorized workspace metadata.
   */
  get(workspaceId: string): Promise<Workspace>;
  /**
   * Lists membership of an accessible workspace.
   * @param workspaceId - Requested workspace.
   * @param pagination - Optional bounds; omitted returns all members.
   * @returns Members ordered by stable user ID.
   */
  listMembers(workspaceId: string, pagination?: Pagination): Promise<Membership[]>;
  /**
   * Authorizes a domain operation against the current user's membership.
   * @param workspaceId - Requested workspace.
   * @param permission - Required operation category.
   * @returns Resolves when access is granted; otherwise rejects.
   */
  assertAccess(workspaceId: string, permission: WorkspacePermission): Promise<void>;
  /**
   * Changes workspace settings as an owner.
   * @param workspaceId - Active workspace to update.
   * @param changes - Editable settings; names are trimmed and validated.
   * @returns The persisted workspace with its stable identity.
   */
  update(workspaceId: string, changes: WorkspaceUpdate): Promise<Workspace>;
  /**
   * Marks a workspace deleted while preserving its data and membership.
   * @param workspaceId - Workspace to delete as an owner.
   * @returns Resolves after deletion; repeating it preserves the first timestamp.
   */
  delete(workspaceId: string): Promise<void>;
  /**
   * Lists deleted workspaces the current user still owns.
   * @param pagination - Optional bounds applied after owner filtering.
   * @returns Deleted workspaces ordered by name and stable identity.
   */
  listDeleted(pagination?: Pagination): Promise<Workspace[]>;
  /**
   * Restores a deleted workspace with its original identity and membership.
   * @param workspaceId - Workspace to restore as an owner.
   * @returns Resolves after restoration; an active workspace is a no-op.
   */
  restore(workspaceId: string): Promise<void>;
  /**
   * Adds or updates a workspace member without removing the last owner.
   * @param workspaceId - Workspace being changed.
   * @param userId - Existing local profile to add or update.
   * @param role - Granted workspace role.
   * @returns Resolves after the membership is durable.
   */
  setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  /**
   * Removes membership while preserving at least one owner.
   * @param workspaceId - Workspace being changed.
   * @param userId - Member to remove.
   * @returns Resolves after removal; missing membership is a no-op.
   */
  removeMember(workspaceId: string, userId: string): Promise<void>;
}
