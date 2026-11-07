/**
 * Implements user-scoped workspace operations through storage-independent repositories.
 * Domain rules authorize membership and lifecycle changes within each transaction.
 * Storage adapters supply records while preserving atomic checks and writes.
 */
import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../identity/types.ts";
import { requireUser } from "../identity/service.ts";
import type { Workspace, WorkspacePermission, WorkspaceRole, WorkspaceService, WorkspaceUpdate } from "./types.ts";
import { assertAccess, assertMembershipChange, assertWorkspaceLifecycleChange, normalizeName } from "./access.ts";
import { assertPagination, type Pagination } from "../../lib/pagination/index.ts";
import type { ApplicationStorage } from "../../storage/types.ts";

export class WorkspaceServiceImpl implements WorkspaceService {
  private readonly userId: string;
  private readonly storage: ApplicationStorage;
  /**
   * Connects the dependencies required by this instance.
   * @param storage - Storage providing transactional repository access.
   * @param user - Authenticated actor or profile record.
   */
  constructor(storage: ApplicationStorage, user: AuthenticatedUser) { this.storage = storage; this.userId = user.userId; }
  /**
   * Creates a workspace and its initial owner atomically.
   * @param name - Validated display name.
   * @returns The requested result after the operation completes.
   */
  async create(name: string): Promise<Workspace> {
    const workspace = { id: randomUUID(), name: normalizeName(name), deletedAt: null };
    return this.storage.transaction(async ({ identity, workspaces }) => {
      await requireUser(identity, this.userId);
      await workspaces.insert(workspace, this.userId);
      return workspace;
    });
  }
  /**
   * Lists active workspaces accessible to the authenticated user.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async listAccessible(pagination?: Pagination): Promise<Workspace[]> {
    assertPagination(pagination);
    await requireUser(this.storage.identity, this.userId);
    return this.storage.workspaces.list(this.userId, false, pagination);
  }
  /**
   * Returns a record after the required access checks.
   * @param workspaceId - Stable workspace identity.
   * @returns The requested result after the operation completes.
   */
  async get(workspaceId: string): Promise<Workspace> {
    const { workspace, members } = await this.storage.workspaces.load(workspaceId);
    assertAccess(workspace, members, this.userId, "read");
    return workspace;
  }
  /**
   * Lists workspace members after checking read access.
   * @param workspaceId - Stable workspace identity.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async listMembers(workspaceId: string, pagination?: Pagination) {
    assertPagination(pagination);
    const { workspace, members } = await this.storage.workspaces.load(workspaceId);
    assertAccess(workspace, members, this.userId, "read");
    return pagination ? members.slice(pagination.offset, pagination.offset + pagination.limit) : members;
  }
  /**
   * Checks the authenticated user’s current workspace permission.
   * @param workspaceId - Stable workspace identity.
   * @param permission - Required workspace capability.
   * @returns The requested result after the operation completes.
   */
  async assertAccess(workspaceId: string, permission: WorkspacePermission): Promise<void> {
    const { workspace, members } = await this.storage.workspaces.load(workspaceId);
    assertAccess(workspace, members, this.userId, permission);
  }
  /**
   * Persists validated editable fields for the requested record.
   * @param workspaceId - Stable workspace identity.
   * @param changes - Validated editable fields.
   * @returns The requested result after the operation completes.
   */
  async update(workspaceId: string, changes: WorkspaceUpdate): Promise<Workspace> {
    const name = normalizeName(changes.name);
    return this.storage.transaction(async ({ workspaces }) => {
      const { workspace, members } = await workspaces.load(workspaceId);
      assertAccess(workspace, members, this.userId, "manage");
      return workspaces.updateName(workspaceId, name);
    });
  }
  /**
   * Marks the workspace deleted while retaining membership.
   * @param workspaceId - Stable workspace identity.
   * @returns The requested result after the operation completes.
   */
  async delete(workspaceId: string): Promise<void> { await this.changeDeletion(workspaceId, true); }
  /**
   * Lists deleted workspaces owned by the authenticated user.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async listDeleted(pagination?: Pagination): Promise<Workspace[]> {
    assertPagination(pagination);
    await requireUser(this.storage.identity, this.userId);
    return this.storage.workspaces.list(this.userId, true, pagination);
  }
  /**
   * Restores a deleted workspace and its retained membership.
   * @param workspaceId - Stable workspace identity.
   * @returns The requested result after the operation completes.
   */
  async restore(workspaceId: string): Promise<void> { await this.changeDeletion(workspaceId, false); }
  /**
   * Authorizes and records the lifecycle transition atomically.
   * @param workspaceId - Stable workspace identity.
   * @param deleted - Whether to select or mark deleted records.
   * @returns The requested result after the operation completes.
   */
  private async changeDeletion(workspaceId: string, deleted: boolean): Promise<void> {
    await this.storage.transaction(async ({ workspaces }) => {
      const { workspace, members } = await workspaces.load(workspaceId, true);
      assertWorkspaceLifecycleChange(workspace, members, this.userId);
      await workspaces.setDeletedAt(workspaceId, deleted ? workspace.deletedAt ?? Date.now() : null);
    });
  }
  /**
   * Adds or changes membership after owner authorization.
   * @param workspaceId - Stable workspace identity.
   * @param userId - Stable user identity.
   * @param role - Membership role to persist.
   * @returns The requested result after the operation completes.
   */
  async setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> { await this.changeMember(workspaceId, userId, role); }
  /**
   * Removes the requested workspace membership.
   * @param workspaceId - Stable workspace identity.
   * @param userId - Stable user identity.
   * @returns The requested result after the operation completes.
   */
  async removeMember(workspaceId: string, userId: string): Promise<void> { await this.changeMember(workspaceId, userId, null); }
  /**
   * Authorizes and applies the membership change in one transaction.
   * @param workspaceId - Stable workspace identity.
   * @param userId - Stable user identity.
   * @param role - Membership role to persist.
   * @returns The requested result after the operation completes.
   */
  private async changeMember(workspaceId: string, userId: string, role: WorkspaceRole | null): Promise<void> {
    await this.storage.transaction(async ({ identity, workspaces }) => {
      const { workspace, members } = await workspaces.load(workspaceId);
      assertMembershipChange(workspace, members, this.userId, userId, role);
      if (role === null) await workspaces.removeMember(workspaceId, userId);
      else { await requireUser(identity, userId); await workspaces.setMember(workspaceId, userId, role); }
    });
  }
}
