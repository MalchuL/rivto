/**
 * Verifies the local HTTP boundary using real sessions and temporary SQLite.
 * Unauthenticated callers, foreign origins, forged actors, and malformed input
 * cannot bypass the domain services that browser and Electron share.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDatabase } from "../../storage/sqlite/database.ts";
import { WorkspaceServiceImpl } from "../../domain/workspaces/service.ts";
import { IdentityServiceImpl } from "../../domain/identity/service.ts";
import { SqliteStorage } from "../../storage/sqlite/storage.ts";
import { createAuthenticationService } from ".././auth.ts";
import { LocalApi } from ".././local-api.ts";
import { createApplicationRuntime } from ".././application.ts";
import { LocalServicesPlugin } from ".././local-services.ts";

const origin = "http://127.0.0.1:3017";

/** @param t - Test cleanup owner. @returns Resolves after verifying session-derived authorization. */
test("local API requires a real session, same-origin mutations, and current workspace permissions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-api-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  const handler = new LocalApi(services.storage, createAuthenticationService(services)).handle;
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  /** @param name - Distinct test identity. @returns A real user and browser cookie. */
  async function register(name: string) {
    const response = await handler(new Request(`${origin}/api/auth/sign-up/email`, {
      method: "POST", headers: { "content-type": "application/json", origin, "x-chulane-client-ip": "127.0.0.4" },
      body: JSON.stringify({ name, email: `${name}@example.test`, password: "Valid local password 42" }),
    }));
    assert.equal(response.status, 200, await response.clone().text());
    return { user: (await response.json()).user, cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
  }
  const alice = await register("Alice");
  const bob = await register("Bob");
  /** @param cookie - Session cookies. @param body - Optional mutation. @param requestOrigin - Browser origin. @returns API response. */
  async function request(cookie: string, body?: object, requestOrigin = origin) {
    return handler(new Request(`${origin}/api/local`, {
      method: body ? "POST" : "GET", headers: { cookie, origin: requestOrigin, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }));
  }
  const overlapping = await Promise.all([
    request(alice.cookie, { action: "create", name: "Alice concurrent team" }),
    request(bob.cookie, { action: "create", name: "Bob concurrent team" }),
  ]);
  assert.deepEqual(overlapping.map((response) => response.status), [200, 200]);
  assert.ok((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.user.id }).listAccessible()).some((workspace) => workspace.name === "Alice concurrent team"));
  assert.ok((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.user.id }).listAccessible()).some((workspace) => workspace.name === "Bob concurrent team"));
  assert.equal((await request("")).status, 401);
  assert.equal((await request(alice.cookie, { action: "create", name: "Team" }, "https://foreign.example")).status, 403);
  assert.equal((await request(alice.cookie, { action: "create", name: 42 })).status, 400);
  assert.equal((await request(alice.cookie, { action: "create", name: "Team" })).status, 200);
  const state = await (await request(alice.cookie)).json();
  const shared = state.workspaces.find((workspace: { name: string }) => workspace.name === "Team");
  assert.ok(shared);
  assert.equal((await request(alice.cookie, { action: "set-member", workspaceId: shared.id, userId: bob.user.id, role: "viewer" })).status, 200);
  assert.equal((await request(bob.cookie, { action: "update", actorId: alice.user.id, workspaceId: shared.id, name: "Forged" })).status, 403);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.user.id }).get(shared.id)).name, "Team");
  const bobState = await (await request(bob.cookie)).json();
  assert.equal(bobState.workspaces.find((workspace: { id: string }) => workspace.id === shared.id).role, "viewer");
  const aliceInitial = state.workspaces.find((workspace: { name: string }) => workspace.name === "Alice concurrent team");
  assert.ok(!bobState.workspaces.some((workspace: { id: string }) => workspace.id === aliceInitial.id));
  assert.equal((await request(alice.cookie, { action: "remove-member", workspaceId: shared.id, userId: bob.user.id })).status, 200);
  assert.equal((await request(bob.cookie, { action: "update", workspaceId: shared.id, name: "Still denied" })).status, 403);
  assert.equal((await handler(new Request(`${origin}/api/local`, { method: "POST", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await request(alice.cookie, { action: "create", name: "x".repeat(16_385) })).status, 400);
  assert.equal((await handler(new Request(`${origin}/api/local`, { method: "DELETE", headers: { cookie: alice.cookie, origin } }))).status, 405);
  assert.equal((await request(alice.cookie, { action: "update-profile", userId: bob.user.id, name: "Alicia" })).status, 200);
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: alice.user.id }).get(alice.user.id), { id: alice.user.id, name: "Alicia" });
  assert.equal((await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: bob.user.id }).get(bob.user.id)).name, "Bob");
  assert.equal((await request(alice.cookie, { action: "update-profile", name: " " })).status, 400);
  assert.equal((await request(alice.cookie, { action: "update", workspaceId: shared.id, name: "New team", id: bob.user.id })).status, 200);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.user.id }).get(shared.id)).name, "New team");
  await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: alice.user.id }).setMemberRole(shared.id, bob.user.id, "viewer");
  assert.equal((await request(bob.cookie, { action: "delete", actorId: alice.user.id, workspaceId: shared.id })).status, 403);
  assert.equal((await request(bob.cookie, { action: "restore", workspaceId: shared.id })).status, 403);
  assert.equal((await request(alice.cookie, { action: "delete", workspaceId: shared.id })).status, 200);
  const deletedState = await (await request(alice.cookie)).json();
  assert.ok(!deletedState.workspaces.some((workspace: { id: string }) => workspace.id === shared.id));
  assert.equal(deletedState.deletedWorkspaces[0].id, shared.id);
  assert.deepEqual((await (await request(bob.cookie)).json()).deletedWorkspaces, []);
  assert.equal((await request(alice.cookie, { action: "update", workspaceId: shared.id, name: "Hidden" })).status, 403);
  assert.equal((await request(alice.cookie, { action: "restore", workspaceId: shared.id })).status, 200);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: bob.user.id }).get(shared.id)).name, "New team");
  const initial = deletedState.workspaces.find((workspace: { id: string }) => workspace.id === aliceInitial.id);
  assert.equal((await request(alice.cookie, { action: "delete", workspaceId: initial.id })).status, 200);
});

/** @param t - Test cleanup owner. @returns Resolves when Cordis exposes and disposes local services. */
test("Cordis owns local service startup and closes the database on disposal", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-plugin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = await createApplicationRuntime([new LocalServicesPlugin(join(directory, "app.sqlite"))]);
  const handler = runtime.ctx.get("localHandler")!;
  assert.ok(handler);
  const signup = await handler(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-chulane-client-ip": "127.0.0.7" },
    body: JSON.stringify({ name: "Alice", email: "dispose@example.test", password: "Local disposal password 42" }),
  }));
  assert.equal(signup.status, 200, await signup.clone().text());
  const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  await runtime.dispose();
  assert.equal(runtime.ctx.get("localHandler"), undefined);
  const response = await handler(new Request(`${origin}/api/local`, { headers: { cookie } }));
  assert.equal(response.status, 500);
});

/** @param t - Cleanup owner. @returns Resolves after successful and rejected operations forward renewed session cookies. */
test("local API forwards session renewal cookies on success and operation errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-session-renewal-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  const handler = new LocalApi(services.storage, createAuthenticationService(services)).handle;
  const registered = await handler(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-chulane-client-ip": "127.0.0.5" },
    body: JSON.stringify({ name: "Alice", email: "renewal@example.test", password: "Session renewal password 42" }),
  }));
  assert.equal(registered.status, 200, await registered.clone().text());
  const cookie = registered.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  for (const body of [undefined, { action: "unknown" }]) {
    // Better Auth refreshes after one day; age the DB session without waiting for wall time.
    const agedExpiry = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await services.database.run(sql`UPDATE session SET expires_at = ${agedExpiry}`);
    const response = await handler(new Request(`${origin}/api/local`, {
      method: body ? "POST" : "GET", headers: { cookie, origin, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }));
    assert.equal(response.status, body ? 400 : 200);
    assert.ok(response.headers.getSetCookie().some((value) => value.startsWith("better-auth.session_token=") && value.includes("Max-Age=604800")));
    const renewed = await services.database.get<{ expires_at: number }>(sql`SELECT expires_at FROM session`);
    assert.ok(renewed!.expires_at > agedExpiry);
  }
  await services.database.run(sql`UPDATE session SET expires_at = 0`);
  const expired = await handler(new Request(`${origin}/api/local`, { headers: { cookie } }));
  assert.equal(expired.status, 401);
  assert.ok(expired.headers.getSetCookie().some((value) => value.startsWith("better-auth.session_token=") && value.includes("Max-Age=0")));
});

