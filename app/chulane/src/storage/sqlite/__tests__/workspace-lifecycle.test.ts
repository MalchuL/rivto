/**
 * Verifies profile updates and recoverable workspace deletion against real SQLite.
 * Role checks, stable IDs, preserved membership, rollback, and restart recovery
 * protect the service contracts consumed by HTTP and future application tools.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sql } from "drizzle-orm";
import { SqliteDatabase } from "../database.ts";
import { WorkspaceServiceImpl } from "../../../domain/workspaces/service.ts";
import { IdentityServiceImpl, UserProvisioner } from "../../../domain/identity/service.ts";
import { SqliteStorage } from "../storage.ts";

/** @param t - Cleanup owner. @returns Resolves when explicit profile changes survive provisioning and restart. */
test("profile update preserves identity and is authoritative after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-profile-update-"));
  const path = join(directory, "app.sqlite");
  let services = await SqliteDatabase.open(path);
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  await new UserProvisioner(services.storage).provision({ id: "bob", name: "Bob" });
  const profileChanges = { name: "  Alicia  ", id: "bob" };
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).update(profileChanges), { id: "alice", name: "Alicia" });
  await assert.rejects(new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).update({ name: " " }), /name/i);
  await assert.rejects(new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "missing" }).update({ name: "Nobody" }), /user/i);
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).get("bob"), { id: "bob", name: "Bob" });
  services.close();
  services = await SqliteDatabase.open(path);
  assert.deepEqual(await new UserProvisioner(services.storage).provision({ id: "alice", name: "Old auth name" }), { id: "alice", name: "Alicia" });
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listAccessible()).length, 0);
});

/** @param t - Cleanup owner. @returns Resolves when owners update, delete, and restore while all other access is denied. */
test("workspace deletion preserves members and survives restart with owner-only recovery", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-workspace-lifecycle-"));
  const path = join(directory, "app.sqlite");
  let services = await SqliteDatabase.open(path);
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  for (const id of ["alice", "bob", "editor", "viewer", "outsider"]) await new UserProvisioner(services.storage).provision({ id, name: id });
  const workspace = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("Team");
  for (const [id, role] of [["bob", "owner"], ["editor", "editor"], ["viewer", "viewer"]] as const) {
    await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).setMemberRole(workspace.id, id, role);
  }
  const workspaceChanges = { name: "  New team  ", id: "forged", deletedAt: Date.now() };
  const updated = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).update(workspace.id, workspaceChanges);
  assert.deepEqual(updated, { ...workspace, name: "New team" });
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).update(workspace.id, { name: " " }), /name/i);
  for (const id of ["editor", "viewer", "outsider"]) {
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).update(workspace.id, { name: "Forbidden" }), /access/i);
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).delete(workspace.id), /access/i);
  }
  const members = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listMembers(workspace.id);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).delete(workspace.id);
  const deleted = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listDeleted();
  assert.equal(deleted.length, 1);
  assert.ok(deleted[0].deletedAt !== null);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).delete(workspace.id);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listDeleted({ limit: 1, offset: 0 }), deleted);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listDeleted({ limit: 0, offset: 0 }), []);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listDeleted({ limit: -1, offset: 0 }), /pagination/i);
  for (const id of ["alice", "bob", "editor", "viewer", "outsider"]) {
    assert.ok(!(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).listAccessible()).some((item) => item.id === workspace.id));
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).get(workspace.id), /access/i);
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).assertAccess(workspace.id, "read"), /access/i);
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).listMembers(workspace.id), /access/i);
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).update(workspace.id, { name: "Hidden" }), /access/i);
  }
  for (const id of ["editor", "viewer", "outsider"]) {
    assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).listDeleted(), []);
    await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: id }).restore(workspace.id), /access/i);
  }
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).setMemberRole(workspace.id, "editor", "owner"), /access/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).removeMember(workspace.id, "bob"), /access/i);
  services.close();
  services = await SqliteDatabase.open(path);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listDeleted(), deleted);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).restore(workspace.id);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).restore(workspace.id);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "editor" }).get(workspace.id), updated);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "viewer" }).listMembers(workspace.id), members);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listDeleted(), []);
});

/** @param t - Cleanup owner. @returns Resolves when failed status writes leave the workspace accessible. */
test("workspace deletion rolls back without losing metadata or membership", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-delete-rollback-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  const workspace = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("Team");
  await services.database.run(sql`CREATE TRIGGER reject_delete BEFORE UPDATE ON workspaces WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).delete(workspace.id));
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).get(workspace.id), workspace);
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listMembers(workspace.id), [{ userId: "alice", role: "owner" }]);
  await services.database.run(sql`DROP TRIGGER reject_delete`);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).delete(workspace.id);
  const deleted = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listDeleted();
  await services.database.run(sql`CREATE TRIGGER reject_restore BEFORE UPDATE ON workspaces WHEN NEW.deleted_at IS NULL BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).restore(workspace.id));
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listDeleted(), deleted);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).get(workspace.id), /access/i);
});
