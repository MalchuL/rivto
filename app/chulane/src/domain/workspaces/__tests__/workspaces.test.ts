/**
 * Defines workspace access independently of persistence and framework concerns.
 * Membership roles govern reading, writing, and management for all workspaces,
 * including protection of the final owner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAccess, assertMembershipChange } from ".././access.ts";
import type { Membership, Workspace } from ".././types.ts";

const workspace: Workspace = { id: "shared", name: "Team", deletedAt: null };
const members: Membership[] = [
  { userId: "owner", role: "owner" },
  { userId: "editor", role: "editor" },
  { userId: "viewer", role: "viewer" },
];

/** @returns No value after verifying the complete role/access matrix. */
test("workspace roles enforce read, write, and manage permissions", () => {
  for (const actor of ["owner", "editor", "viewer", "outsider"]) {
    for (const permission of ["read", "write", "manage"] as const) {
      const allowed = actor === "owner" || (actor === "editor" && permission !== "manage")
        || (actor === "viewer" && permission === "read");
      if (allowed) assert.doesNotThrow(() => assertAccess(workspace, members, actor, permission));
      else assert.throws(() => assertAccess(workspace, members, actor, permission), /access/i);
    }
  }
});

/** @returns No value after verifying last-owner protection and owner transfer. */
test("membership changes require an owner and preserve at least one owner", () => {
  assert.throws(() => assertMembershipChange(workspace, members, "editor", "viewer", "owner"), /access/i);
  assert.throws(() => assertMembershipChange(workspace, members, "owner", "owner", null), /last owner/i);
  assert.throws(() => assertMembershipChange(workspace, members, "owner", "owner", "editor"), /last owner/i);
  assert.doesNotThrow(() => assertMembershipChange(workspace, members, "owner", "owner", "owner"));
  const coOwners = [...members, { userId: "second", role: "owner" as const }];
  assert.doesNotThrow(() => assertMembershipChange(workspace, coOwners, "owner", "owner", null));
});
