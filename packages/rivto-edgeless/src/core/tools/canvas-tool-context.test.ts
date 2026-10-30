import { RevisionStore } from "../../utils/revision-store";
import type { CanvasToolGroupEntry, CanvasToolRegistration } from "../../types/tool-registry";
import { jest } from "@jest/globals";
import { CanvasTool } from "./canvas-tool";
import { CanvasToolGroup } from "./canvas-tool-group";
import { CanvasToolContext } from "./canvas-tool-context";
import { CanvasToolRegistry } from "./canvas-tool-registry";

/**
 * Creates one independent consumer session over a shared registration registry.
 *
 * @param registry - Shared application registrations.
 * @returns A session with isolated group settings and instances.
 */
function session(registry: CanvasToolRegistry) {
  return new CanvasToolContext<
    CanvasTool,
    CanvasToolGroup<{ color: string }, CanvasToolGroupEntry>,
    CanvasToolRegistration,
    CanvasToolGroupEntry
  >({
    registry,
    createTool: (entry, group) => entry.createTool({ id: entry.id, group }),
    createGroup: (entry) => {
      let settings = { color: "blue" };
      return new CanvasToolGroup(entry, {
        /**
         * Reads the local settings without exposing mutable storage.
         *
         * @returns Detached group values.
         */
        get: () => ({ ...settings }),
        /**
         * Applies an explicit local settings patch.
         *
         * @param patch - New values for this group.
         * @returns Subsequent reads include the patch.
         */
        set: (patch) => {
          settings = { ...settings, ...patch };
        },
      });
    },
  });
}

test("shared registrations create isolated sessions and removing a group cancels its active tool", () => {
  const registry = new CanvasToolRegistry();
  registry.registerTool({
    id: "inspect",
    title: "Inspect",
    default: true,
    createTool: (options) => new CanvasTool(options),
  });
  registry.registerTool({
    id: "custom",
    title: "Custom",
    group: "extension",
    createTool: (options) => new CanvasTool(options),
  });
  const first = session(registry),
    second = session(registry);
  const stopFirst = first.observeChanges(),
    stopSecond = second.observeChanges();
  expect(first.getTool("custom")).toBeUndefined();
  const remove = registry.registerGroup({ id: "extension", title: "Extension" });
  first.activate("custom");
  second.activate("custom");
  expect(first.active).not.toBe(second.active);
  expect(first.active?.group).toBe(first.getGroup("extension"));
  first.getGroup("extension")!.setSettings({ color: "red" });
  expect(second.getGroup("extension")!.getSettings()).toEqual({ color: "blue" });
  const dispose = jest.spyOn(first.active!, "dispose");
  remove();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(first.active?.id).toBe("inspect");
  expect(first.getTool("custom")).toBeUndefined();
  remove();
  expect(dispose).toHaveBeenCalledTimes(1);
  stopFirst();
  stopSecond();
});

test("registry ordering, default uniqueness and disposal do not depend on editor ownership", () => {
  const registry = new CanvasToolRegistry();
  const release = registry.registerTool({
    id: "inspect",
    title: "Inspect",
    default: true,
    createTool: (options) => new CanvasTool(options),
  });
  registry.registerGroup({ id: "later", title: "Later" });
  registry.registerTool({
    id: "member",
    title: "Member",
    group: "later",
    createTool: (options) => new CanvasTool(options),
  });
  expect(registry.getEntries().map((entry) => entry.registration.id)).toEqual(["inspect", "later"]);
  expect(() =>
    registry.registerTool({
      id: "other",
      title: "Other",
      default: true,
      createTool: (options) => new CanvasTool(options),
    }),
  ).toThrow(/default/);
  const tools = session(registry);
  const stop = tools.observeChanges();
  const dispose = jest.spyOn(tools.active!, "dispose");
  registry.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(tools.active).toBeUndefined();
  release();
  stop();
  expect(() => registry.registerGroup({ id: "late", title: "Late" })).toThrow(/disposed/);
});

test("session cleanup can remount with fresh tool instances", () => {
  const registry = new CanvasToolRegistry();
  registry.registerTool({
    id: "inspect",
    title: "Inspect",
    default: true,
    createTool: (options) => new CanvasTool(options),
  });
  const tools = session(registry);
  const stop = tools.observeChanges();
  const original = tools.active!;
  stop();
  const stopAgain = tools.observeChanges();
  expect(tools.active).not.toBe(original);
  stopAgain();
});

test("registry disposal clears subscriptions even when a subscriber throws", () => {
  const registry = new CanvasToolRegistry();
  const clear = jest.spyOn(RevisionStore.prototype, "clear");
  const release = registry.registerTool({
    id: "select",
    title: "Select",
    createTool: (options) => new CanvasTool(options),
  });
  registry.subscribe(() => {
    throw new Error("observer failure");
  });
  expect(() => registry.dispose()).toThrow("observer failure");
  expect(clear).toHaveBeenCalledTimes(1);
  clear.mockRestore();
  expect(registry.getTools()).toEqual([]);
  expect(() => registry.dispose()).not.toThrow();
  expect(() => release()).not.toThrow();
  expect(() =>
    registry.registerTool({
      id: "later",
      title: "Later",
      createTool: (options) => new CanvasTool(options),
    }),
  ).toThrow("disposed");
});
