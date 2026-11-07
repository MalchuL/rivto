/** Verifies runtime registration and resource cleanup through the real Cordis lifecycle. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationRuntime } from "../../../runtime/application.ts";
import { NetworkServicesPlugin } from ".././plugin.ts";

test("Cordis disposes network services and their clients", async () => {
  const runtime = await createApplicationRuntime([new NetworkServicesPlugin()]);
  const http = runtime.ctx.get("http")!;
  const sockets = runtime.ctx.get("sockets")!;
  const client = http.create({ baseUrl: "http://localhost" });
  await runtime.dispose();
  assert.throws(() => http.create({ baseUrl: "http://localhost" }), /disposed/);
  assert.throws(() => sockets.connect({ url: "ws://localhost" }), /disposed/);
  await assert.rejects(client.get("/"), /disposed/);
});
