/**
 * Shares transaction-compatible SQLite lookups between local domain adapters.
 * Callers pass their active connection or transaction so authorization reads
 * and writes remain within the same atomic operation. No connection is owned here.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { DomainError } from "../../domain/workspaces/access.ts";
import * as schema from "./schema.ts";

type Database = Pick<LibSQLDatabase<typeof schema>, "select" | "insert" | "update" | "delete">;
const { users, workspaces, memberships } = schema;

/**
 * Requires an existing local profile within a service operation.
 * @param db - Active connection or transaction.
 * @param userId - Stable profile identity.
 * @returns The stored profile.
 */
export async function requireUser(db: Database, userId: string) {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new DomainError("not-found", "User not found.");
  return user;
}

/**
 * Loads an active workspace and membership for authorization, hiding tombstones by default.
 * @param db - Active connection or transaction.
 * @param workspaceId - Requested workspace.
 * @param includeDeleted - Allows lifecycle operations to authorize against preserved membership.
 * @returns The workspace and its ordered members.
 */
export async function loadWorkspace(db: Database, workspaceId: string, includeDeleted = false) {
  const workspace = await db.select().from(workspaces).where(and(eq(workspaces.id, workspaceId), includeDeleted ? undefined : isNull(workspaces.deletedAt))).get();
  if (!workspace) throw new DomainError("forbidden", "Workspace access denied.");
  const members = await db.select({ userId: memberships.userId, role: memberships.role })
    .from(memberships).where(eq(memberships.workspaceId, workspaceId)).orderBy(asc(memberships.userId));
  return { workspace, members };
}

