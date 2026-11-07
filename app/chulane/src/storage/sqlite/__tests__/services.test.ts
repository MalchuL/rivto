/**
 * Exercises application service contracts against actual temporary SQLite files.
 * Reopening, SQL-triggered partial failures, unauthorized mutations, and competing
 * ownership changes verify durability and atomicity rather than mocked queries.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { SqliteDatabase } from "../database.ts";
import { WorkspaceServiceImpl } from "../../../domain/workspaces/service.ts";
import { IdentityServiceImpl, UserProvisioner } from "../../../domain/identity/service.ts";
import { SqliteStorage } from "../storage.ts";

/** @param t - Cleanup owner. @returns Resolves when overlapping writes commit independently and failures release the queue. */
test("overlapping provisioning and workspace writes succeed and recover after rollback", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-concurrent-"));
  const path = join(directory, "app.sqlite");
  const services = await SqliteDatabase.open(path);
  const inspection = createClient({ url: `file:${path}` });
  t.after(async () => { inspection.close(); services.close(); await rm(directory, { recursive: true, force: true }); });
  const provisioned = await Promise.allSettled([
    new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" }),
    new UserProvisioner(services.storage).provision({ id: "bob", name: "Bob" }),
  ]);
  assert.deepEqual(provisioned.map((result) => result.status), ["fulfilled", "fulfilled"]);
  const created = await Promise.allSettled([
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("First team"),
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).create("Second team"),
    new UserProvisioner(services.storage).provision({ id: "charlie", name: "Charlie" }),
  ]);
  assert.deepEqual(created.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled"]);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listAccessible()).length, 1);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listAccessible()).length, 1);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "charlie" }).listAccessible()).length, 0);
  await inspection.execute("CREATE TRIGGER reject_team BEFORE INSERT ON memberships WHEN NEW.user_id = 'alice' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  const recovered = await Promise.allSettled([
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("Rolled back"),
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).create("Survives rollback"),
  ]);
  assert.equal(recovered[0].status, "rejected");
  if (recovered[0].status === "rejected") assert.ok(isInjectedFailure(recovered[0].reason), String(recovered[0].reason.cause ?? recovered[0].reason));
  assert.equal(recovered[1].status, "fulfilled");
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listAccessible()).length, 1);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listAccessible()).length, 2);
});

/** @returns Resolves after verifying ordered pages, validation, and access boundaries. */
test("service listings support limit and offset without weakening access checks", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-pagination-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  for (const id of ["charlie", "bob", "alice"]) {
    await new UserProvisioner(services.storage).provision({ id, name: "Same name" });
  }
  const shared = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("A team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).create("A hidden team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("A team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).create("A team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).setMemberRole(shared.id, "bob", "viewer");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).setMemberRole(shared.id, "charlie", "editor");
  const listings = [
    (page?: { limit: number; offset: number }) => new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).list(page),
    (page?: { limit: number; offset: number }) => new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listAccessible(page),
    (page?: { limit: number; offset: number }) => new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "charlie" }).listMembers(shared.id, page),
  ];
  for (const list of listings) {
    const all = await list();
    assert.equal(all.length, 3);
    for (let offset = 0; offset < all.length; offset++) {
      assert.deepEqual(await list({ limit: 1, offset }), all.slice(offset, offset + 1));
    }
    assert.deepEqual(await list({ limit: 2, offset: 2 }), all.slice(2));
    assert.deepEqual(await list({ limit: 1, offset: 10 }), []);
    assert.deepEqual(await list({ limit: 0, offset: 0 }), []);
    for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(list({ limit: invalid, offset: 0 }), { code: "invalid" });
      await assert.rejects(list({ limit: 1, offset: invalid }), { code: "invalid" });
    }
  }
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "missing" }).listAccessible({ limit: 0, offset: 0 }), /user/i);
  const initial = (await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "bob" }).listAccessible()).find((workspace) => workspace.name === "A hidden team")!;
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).listMembers(initial.id, { limit: 0, offset: 0 }), /access/i);
});

/**
 * Recognizes the injected SQLite failure through Drizzle's query error wrapper.
 * @param error - Rejected storage operation.
 * @returns Whether the expected database failure caused the rejection.
 */
function isInjectedFailure(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof Error
    && error.cause.message.includes("injected failure");
}

/** @returns Resolves after persisting users, workspaces, and membership across restart. */
test("explicit workspaces and membership survive restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-identity-"));
  const path = join(directory, "app.sqlite");
  let services = await SqliteDatabase.open(path);
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  const alice = await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  const bob = await new UserProvisioner(services.storage).provision({ id: "bob", name: "Bob" });
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).listAccessible(), []);
  const initial = [await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).create("My workspace")];
  assert.deepEqual(await new UserProvisioner(services.storage).provision(alice), alice);
  assert.deepEqual(await new UserProvisioner(services.storage).provision({ id: alice.id, name: "Changed auth name" }), alice);
  assert.deepEqual(await new UserProvisioner(services.storage).provision({ id: alice.id, name: "" }), alice);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).listAccessible()).length, 1);
  assert.equal(initial[0].name, "My workspace");
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).get(initial[0].id), /access/i);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(initial[0].id, bob.id, "viewer");
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).get(initial[0].id)).id, initial[0].id);
  const shared = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).create("Team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, bob.id, "editor");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).assertAccess(shared.id, "write");
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).update(shared.id, { name: "Stolen" }), /access/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).setMemberRole(shared.id, bob.id, "owner"), /access/i);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).update(shared.id, { name: "Renamed" });
  services.close();
  services = await SqliteDatabase.open(path);
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).list(), [alice, bob]);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).get(shared.id)).name, "Renamed");
  assert.deepEqual(await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).listMembers(shared.id), [
    { userId: alice.id, role: "owner" }, { userId: bob.id, role: "editor" },
  ].sort((a, b) => a.userId.localeCompare(b.userId)));
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, bob.id, "viewer");
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).assertAccess(shared.id, "write"), /access/i);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).removeMember(shared.id, bob.id);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).get(shared.id), /access/i);
});

/** @returns Resolves after proving that a failed second write rolls back the first. */
test("failed workspace creation leaves no partial records", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-rollback-"));
  const path = join(directory, "app.sqlite");
  const services = await SqliteDatabase.open(path);
  const inspection = createClient({ url: `file:${path}` });
  t.after(async () => { inspection.close(); services.close(); await rm(directory, { recursive: true, force: true }); });
  const alice = await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  await inspection.execute("CREATE TRIGGER reject_membership BEFORE INSERT ON memberships BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).create("Team"), isInjectedFailure);
  assert.equal((await inspection.execute("SELECT count(*) AS count FROM workspaces")).rows[0].count, 0);
});

/** @returns Resolves after invalid input and ownership changes are rejected atomically. */
test("validates inputs and preserves the last owner under competing changes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-roles-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  await assert.rejects(new UserProvisioner(services.storage).provision({ id: "empty", name: "   " }), /name/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: "missing" }).create("Team"), /user/i);
  const alice = await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  const bob = await new UserProvisioner(services.storage).provision({ id: "bob", name: "Bob" });
  const shared = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).create("Team");
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).update(shared.id, { name: " " }), /name/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, "missing", "viewer"), /user/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, bob.id, "root" as "owner"), /role/i);
  await assert.rejects(new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).removeMember(shared.id, alice.id), /last owner/i);
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, bob.id, "owner");
  const results = await Promise.allSettled([
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).setMemberRole(shared.id, alice.id, "viewer"),
    new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.id }).setMemberRole(shared.id, bob.id, "viewer"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const members = await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.id }).listMembers(shared.id);
  assert.equal(members.filter((member) => member.role === "owner").length, 1);
});

/** @param t - Cleanup owner. @returns Resolves after a fresh pooled connection waits for another process to release its write lock. */
test("new SQLite connections wait for external writers", { timeout: 10_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-external-writer-"));
  const path = join(directory, "app.sqlite");
  const services = await SqliteDatabase.open(path);
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  // Holding the original connection forces this query onto a fresh pool connection.
  await services.database.transaction(async () => {
    const rows = await services.database.all<{ timeout: number }>(sql`PRAGMA busy_timeout`);
    assert.equal(rows[0].timeout, 5000);
  });
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createClient } from "@libsql/client";
    const client = createClient({ url: process.argv[1] });
    const transaction = await client.transaction("write");
    console.log("locked");
    setTimeout(async () => { await transaction.rollback(); client.close(); }, 300);
  `, pathToFileURL(path).href], { stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(writer, "exit");
  t.after(async () => { if (writer.exitCode === null) { writer.kill(); await exited; } });
  await Promise.race([
    once(writer.stdout, "data"),
    exited.then(() => { throw new Error("External writer exited before acquiring its lock."); }),
  ]);
  const user = await new UserProvisioner(services.storage).provision({ id: "alice", name: "Alice" });
  assert.deepEqual(user, { id: "alice", name: "Alice" });
  assert.deepEqual(await exited, [0, null]);
});
