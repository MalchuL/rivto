/** Verifies repository contracts and cross-repository rollback against real SQLite. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ApplicationStorage } from "../../types.ts";
import { SqliteDatabase } from "../database.ts";

/**
 * Exercises storage-independent records and atomic rollback through the public contract.
 * @param storage - Adapter providing both repositories and atomic transactions.
 * @returns Resolves after the contract assertions pass.
 */
async function verifyRepositoryContract(storage: ApplicationStorage): Promise<void> {
  const user = { id: "alice", name: "Alice" };
  const workspace = { id: "team", name: "Team", deletedAt: null };
  await storage.transaction(async ({ identity, workspaces }) => {
    await identity.insert(user);
    await workspaces.insert(workspace, user.id);
  });
  assert.deepEqual(await storage.identity.find(user.id), user);
  assert.deepEqual(await storage.workspaces.load(workspace.id), { workspace, members: [{ userId: user.id, role: "owner" }] });
  await assert.rejects(storage.transaction(async ({ identity, workspaces }) => {
    await identity.update(user.id, "Changed");
    await workspaces.setDeletedAt(workspace.id, 1);
    throw new Error("rollback");
  }), /rollback/);
  assert.deepEqual(await storage.identity.find(user.id), user);
  assert.deepEqual(await storage.workspaces.list(user.id, false), [workspace]);
}

/** @param t - Cleanup owner. @returns Resolves after the SQLite adapter passes the repository contract. */
test("SQLite repositories preserve records and rollback across domains", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-repository-contract-"));
  const database = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });
  await verifyRepositoryContract(database.storage);
});
