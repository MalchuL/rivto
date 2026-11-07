/**
 * Verifies Better Auth against real local storage without a mail or model server.
 * Registration, password checks, cookie sessions, logout, and restart recovery
 * exercise the actual integration rather than replacing authentication with mocks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { SqliteDatabase } from "../../storage/sqlite/database.ts";
import { WorkspaceServiceImpl } from "../../domain/workspaces/service.ts";
import { IdentityServiceImpl } from "../../domain/identity/service.ts";
import { SqliteStorage } from "../../storage/sqlite/storage.ts";
import { createAuthenticationService } from ".././auth.ts";
import { LocalApi } from ".././local-api.ts";

const origin = "http://127.0.0.1:3017";

/** @param t - Test cleanup owner. @returns Resolves after real password and session checks. */
test("password registration starts without a workspace and sessions survive restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-auth-"));
  const path = join(directory, "app.sqlite");
  let services = await SqliteDatabase.open(path);
  let auth = createAuthenticationService(services).auth;
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  /**
   * Sends a same-origin browser request to the actual Better Auth handler.
   * @param path - Auth endpoint suffix.
   * @param body - Endpoint arguments.
   * @param cookie - Previously issued browser cookies.
   * @returns The authentication response.
   */
  async function post(path: string, body: object, cookie = "") {
    return auth.handler(new Request(`${origin}/api/auth/${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin, cookie, "x-chulane-client-ip": "127.0.0.2" }, body: JSON.stringify(body),
    }));
  }
  const body = { name: "Alice", email: "alice@example.test", password: "A strong local password 42" };
  const registered = await post("sign-up/email", body);
  assert.equal(registered.status, 200, await registered.clone().text());
  const cookie = registered.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const user = (await registered.json()).user;
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: user.id }).listAccessible()).length, 0);
  const renamed = await post("update-user", { name: "Authentication name" }, cookie);
  assert.equal(renamed.status, 200);
  assert.equal((await auth.api.getSession({ headers: new Headers({ cookie, host: new URL(origin).host }) }))?.user.name, "Authentication name");
  const applicationResponse = await new LocalApi(services.storage, createAuthenticationService(services)).handle(new Request(`${origin}/api/local`, { headers: { cookie } }));
  assert.equal(applicationResponse.status, 200);
  const applicationState = await applicationResponse.json();
  assert.deepEqual(applicationState.user, { id: user.id, name: "Alice" });
  assert.deepEqual(applicationState.users, [{ id: user.id, name: "Alice" }]);
  assert.equal((await post("sign-in/email", { ...body, password: "incorrect password" })).status, 401);
  const credentials = await services.database.select().from((await import("../../storage/sqlite/auth-schema.ts")).account);
  assert.notEqual(credentials[0].password, body.password);
  assert.ok(credentials[0].password);
  services.close();
  services = await SqliteDatabase.open(path);
  auth = createAuthenticationService(services).auth;
  assert.equal((await auth.api.getSession({ headers: new Headers({ cookie, host: new URL(origin).host }) }))?.user.id, user.id);
  assert.equal((await post("sign-out", {}, cookie)).status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie, host: new URL(origin).host }) }), null);
  assert.equal((await post("sign-in/email", body)).status, 200);
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: user.id }).get(user.id), { id: user.id, name: "Alice" });
  const foreign = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://untrusted.example" }, body: JSON.stringify(body),
  }));
  assert.equal(foreign.status, 403);
});

/** @param t - Test cleanup owner. @returns Resolves after login recovers interrupted application provisioning. */
test("a later password login recovers failed profile provisioning", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chulane-auth-recovery-"));
  const services = await SqliteDatabase.open(join(directory, "app.sqlite"));
  const auth = createAuthenticationService(services).auth;
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  const body = { name: "Alice", email: "recovery@example.test", password: "Local recovery password 42" };
  await services.database.run(sql`CREATE TRIGGER reject_profile BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  const registration = await auth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-chulane-client-ip": "127.0.0.3" }, body: JSON.stringify(body),
  }));
  assert.equal(registration.status, 500);
  assert.deepEqual(await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).list(), []);
  await services.database.run(sql`DROP TRIGGER reject_profile`);
  const login = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-chulane-client-ip": "127.0.0.3" }, body: JSON.stringify(body),
  }));
  assert.equal(login.status, 200, await login.clone().text());
  const users = await new IdentityServiceImpl(new SqliteStorage(services.database), { userId: "alice" }).list();
  assert.equal(users.length, 1);
  assert.equal((await new WorkspaceServiceImpl(new SqliteStorage(services.database), { userId: users[0].id }).listAccessible()).length, 0);
});

/** @returns No value after verifying that production imports do not initialize CLI authentication. */
test("production runtime imports authentication without an external secret", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  for (const key of ["BETTER_AUTH_SECRET", "AUTH_SECRET", "TEST"]) delete env[key];
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", "--unhandled-rejections=strict", "--input-type=module", "-e",
    `await import(${JSON.stringify(new URL(".././auth.ts", import.meta.url).href)}); await new Promise(resolve => setTimeout(resolve, 50));`,
  ], { env, encoding: "utf8", timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
