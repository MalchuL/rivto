/**
 * Exercises Chulane's composition boundary against the actual Cordis dependency.
 * Test plugins own temporary services, listeners, and asynchronous cleanup so
 * these checks verify readiness, unload behavior, and failed-startup rollback
 * without substituting a mock plugin framework or creating domain features.
 */
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import { createApplicationRuntime } from "./application.ts";

declare module "@deepseek-ai/cordis" {
  interface Events {
    /** Receives a test-only message to verify listener ownership. */
    "test/message"(message: string): void;
  }
}

/**
 * Verifies async startup, dependency access, and awaited cleanup of all resources.
 * @returns Resolves when the application fiber has released its contributions.
 */
test("starts bundled plugins and awaits service, listener, and effect cleanup", async () => {
  const events: string[] = [];
  /**
   * Provides a service after asynchronous setup and registers awaited cleanup.
   * @param ctx - The plugin scope that owns the service and cleanup.
   * @returns Resolves after the service becomes available.
   */
  async function provider(ctx: Context) {
    await setImmediate();
    ctx.provide("testService", "ready");
    /**
     * Registers an asynchronous cleanup operation on the provider scope.
     * @returns The operation awaited when this plugin unloads.
     */
    ctx.effect(() => async () => {
      await setImmediate();
      events.push("provider disposed");
    });
    events.push("provider ready");
  }
  /**
   * Reads the provided service and subscribes within the consumer's lifecycle.
   * @param ctx - The plugin scope that owns the subscription.
   * @returns No value.
   */
  function consumer(ctx: Context) {
    assert.equal(ctx.get("testService"), "ready");
    /**
     * Records messages delivered to the active plugin.
     * @param message - The test event payload.
     * @returns No value.
     */
    ctx.on("test/message", (message) => { events.push(message); });
    events.push("consumer ready");
  }
  const application = await createApplicationRuntime([
    provider,
    { inject: ["testService"], apply: consumer },
  ]);
  try {
    assert.deepEqual(events, ["provider ready", "consumer ready"]);
    assert.equal(application.ctx.get("testService"), "ready");
    application.ctx.emit("test/message", "received");
    assert.equal(events.at(-1), "received");
  } finally {
    await application.dispose();
  }
  assert.equal(application.ctx.get("testService"), undefined);
  assert.equal(events.at(-1), "provider disposed");
  application.ctx.emit("test/message", "after disposal");
  await application.dispose();
  assert.deepEqual(events, ["provider ready", "consumer ready", "received", "provider disposed"]);
});

/**
 * Verifies that a late startup failure releases both prior and partial plugins.
 * @returns Resolves when startup rejects with its original error after rollback.
 */
test("rolls back all plugin resources before rejecting failed startup", async () => {
  const resources = new Set<string>();
  const failure = new Error("plugin startup failed");
  /**
   * Acquires a test resource whose lifetime belongs to the plugin scope.
   * @param ctx - The plugin scope that owns the resource.
   * @returns No value.
   */
  function provider(ctx: Context) {
    resources.add("provider");
    /**
     * Releases the provider's test resource when its scope unloads.
     * @returns The resource disposer.
     */
    ctx.effect(() => () => { resources.delete("provider"); });
  }
  /**
   * Fails after registering cleanup for a partially initialized resource.
   * @param ctx - The plugin scope that owns the partial resource.
   * @returns Rejects with the test's startup failure.
   */
  async function failing(ctx: Context) {
    resources.add("partial");
    /**
     * Registers cleanup that must complete before startup rejection is returned.
     * @returns The asynchronous resource disposer.
     */
    ctx.effect(() => async () => {
      await setImmediate();
      resources.delete("partial");
    });
    throw failure;
  }
  await assert.rejects(createApplicationRuntime([provider, failing]), failure);
  assert.equal(resources.size, 0);
});
