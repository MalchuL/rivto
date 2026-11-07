/**
 * Declares SQLite records for local identities, workspace metadata, and roles.
 * Foreign keys prevent dangling membership, and role checks complement domain
 * validation. All workspaces use the same ownership and membership rules.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const installation = sqliteTable("installation", {
  id: integer("id").primaryKey(),
  authSecret: text("auth_secret").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  deletedAt: integer("deleted_at"),
});

export const memberships = sqliteTable("memberships", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  // Default NO ACTION prevents deleting a user until memberships, including last ownership, are handled explicitly.
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  index("memberships_user_idx").on(table.userId),
  check("membership_role", sql`${table.role} in ('owner', 'editor', 'viewer')`),
]);
