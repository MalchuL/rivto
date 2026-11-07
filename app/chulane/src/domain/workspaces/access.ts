/**
 * Owns workspace authorization and ownership invariants as pure domain rules.
 * Storage adapters invoke these rules within their mutation transactions so
 * permission checks cannot be separated from the writes they authorize.
 */
import type { Membership, Workspace, WorkspacePermission, WorkspaceRole } from "./types.ts";

export class DomainError extends Error {
  readonly code: "invalid" | "forbidden" | "not-found";
  /**
   * Describes an expected application failure without storage-specific details.
   * @param code - Category used by application transports.
   * @param message - User-facing reason for rejection.
   */
  constructor(code: DomainError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Validates display names at service entry points.
 * @param value - Untrusted display name.
 * @returns Trimmed, nonempty name bounded for application display.
 */
export function normalizeName(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
    throw new DomainError("invalid", "Name must contain 1–200 characters.");
  }
  return value.trim();
}

/**
 * Enforces membership-based workspace role permissions.
 * @param workspace - Workspace whose content or settings are requested.
 * @param members - Membership snapshot from the same storage transaction.
 * @param userId - Authenticated user performing the operation.
 * @param permission - Required operation category.
 * @returns No value when access is allowed; otherwise throws.
 */
export function assertAccess(workspace: Workspace, members: Membership[], userId: string, permission: WorkspacePermission): void {
  const role = members.find((member) => member.userId === userId)?.role;
  const allowed = permission === "read" ? role !== undefined
    : permission === "write" ? role === "owner" || role === "editor"
    : permission === "manage" && role === "owner";
  if (!allowed) throw new DomainError("forbidden", "Workspace access denied.");
}

/**
 * Authorizes a membership change while preventing removal of the final owner.
 * @param workspace - Workspace being changed.
 * @param members - Current membership snapshot.
 * @param actingUserId - Acting owner.
 * @param userId - Target member.
 * @param role - New role, or null for removal.
 * @returns No value when the change preserves the domain invariants.
 */
export function assertMembershipChange(workspace: Workspace, members: Membership[], actingUserId: string, userId: string, role: WorkspaceRole | null): void {
  assertAccess(workspace, members, actingUserId, "manage");
  if (role !== null && !["owner", "editor", "viewer"].includes(role)) throw new DomainError("invalid", "Invalid workspace role.");
  const wasOwner = members.some((member) => member.userId === userId && member.role === "owner");
  if (wasOwner && role !== "owner" && members.filter((member) => member.role === "owner").length === 1) {
    throw new DomainError("invalid", "Cannot remove or demote the last owner.");
  }
}

/**
 * Authorizes deletion or restoration using retained ownership, regardless of status.
 * @param workspace - Active or deleted workspace whose lifecycle changes.
 * @param members - Preserved membership from the same mutation transaction.
 * @param actingUserId - Acting owner requesting the transition.
 * @returns No value when the user owns the workspace; otherwise throws.
 */
export function assertWorkspaceLifecycleChange(workspace: Workspace, members: Membership[], actingUserId: string): void {
  assertAccess(workspace, members, actingUserId, "manage");
}
