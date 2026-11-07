/**
 * Exercises user-scoped identity and workspace services against a real local database.
 * Callers cannot choose an acting user per operation, and workspaces are
 * explicitly created before sharing or deletion.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDatabase } from "../database.ts";
import { WorkspaceServiceImpl } from "../../../domain/workspaces/service.ts";
import { IdentityServiceImpl, UserProvisioner } from "../../../domain/identity/service.ts";
import { SqliteStorage } from "../storage.ts";

/** @param t - Cleanup owner. @returns Resolves when workspace and profile operations use their constructor's identity. */
test("user-scoped services use their own identity and explicitly created workspaces are shareable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-scoped-services-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  await new UserProvisioner(services.storage).provision({ id: "bob", name: "Bob" });
  const alice = new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" });
  assert.deepEqual(await alice.listAccessible(), []);
  const bobContext = { userId: "bob" };
  const bob = new WorkspaceServiceImpl(new SqliteStorage(services.database), bobContext);
  bobContext.userId = "alice";
  const profile = new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "bob" });
  const workspace = await alice.create("My workspace");
  await assert.rejects(bob.get(workspace.id), /access/i);
  await alice.setMemberRole(workspace.id, "bob", "editor");
  assert.equal((await bob.get(workspace.id)).id, workspace.id);
  const forgedChange = { name: "Forbidden", userId: "alice" };
  await assert.rejects(bob.update(workspace.id, forgedChange), /access/i);
  assert.deepEqual(await profile.update({ name: "Bobby" }), { id: "bob", name: "Bobby" });
  await alice.delete(workspace.id);
  await assert.rejects(bob.get(workspace.id), /access/i);
  await new UserProvisioner(services.storage).provision({ id: "alice", name: "Old auth name" });
  assert.equal((await alice.listAccessible()).length, 0);
  await alice.restore(workspace.id);
  assert.equal((await bob.get(workspace.id)).id, workspace.id);
});

