import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ReactPanel } from "../../panels/react-panel";
import { EdgelessToolContext } from "../edgeless-tools/edgeless-tool-context";
import { EdgelessTool } from "../edgeless-tools/edgeless-tool";
import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals/extension";
import type { EdgelessToolbarTool } from "./types";

it("orders mixed entries, defers unknown groups, rejects duplicates and cleans up subscriptions", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const registry = panel.editor.edgelessToolbar;
  const tool: EdgelessToolbarTool = {
    id: "single",
    title: "Single",
    createTool: (options) => new EdgelessTool(options),
  };
  let changes = 0;
  const stop = registry.subscribe(() => {
    changes += 1;
  });
  registry.registerTool(tool);
  const releaseGroup = registry.registerGroup({ id: "custom", title: "Custom" });
  expect(registry.getEntries().map((entry) => entry.registration.id)).toEqual(["single"]);
  const releaseTool = registry.registerTool({ ...tool, id: "grouped", group: "custom" });
  const releaseEarly = registry.registerTool({ ...tool, id: "early", order: -1 });
  expect(registry.getEntries().map((entry) => entry.registration.id)).toEqual([
    "early",
    "single",
    "custom",
  ]);
  expect(() => registry.registerTool(tool)).toThrow(/already exists/);
  expect(() => registry.registerGroup({ id: "custom", title: "Duplicate" })).toThrow(
    /already exists/,
  );
  releaseGroup();
  expect(registry.getTool("grouped")).toBeDefined();
  expect(registry.getEntries().map((entry) => entry.registration.id)).toEqual(["early", "single"]);
  registry.registerGroup({ id: "custom", title: "Restored" });
  expect(registry.getEntries().map((entry) => entry.registration.id)).toEqual([
    "early",
    "single",
    "custom",
  ]);
  releaseTool();
  releaseTool();
  releaseEarly();
  const count = changes;
  stop();
  await panel.editor.destroy();
  expect(changes).toBe(count);
  expect(registry.getTools()).toEqual([]);
  expect(registry.getGroups()).toEqual([]);
  expect(() => registry.registerTool(tool)).toThrow();
  await core.destroy();
});

it("remembers group tools per panel, resets removed active tools and does not write document state", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const second = new ReactPanel(first.editor, new ChildrenPanel(core));
  const a = new EdgelessToolContext(first);
  const b = new EdgelessToolContext(second);
  const stopA = a.observeChanges();
  const stopB = b.observeChanges();
  const registry = first.editor.edgelessToolbar;
  let notifications = 0;
  const stop = core.subscribe(() => {
    notifications += 1;
  });
  a.activate("ellipse");
  a.reset();
  expect(a.getGroupTool("shapes")?.id).toBe("ellipse");
  expect(b.getGroupTool("shapes")?.id).toBe("rectangle");
  a.activateGroup("shapes");
  expect(a.active?.id).toBe("ellipse");
  b.activateGroup("drawing");
  expect(b.active?.id).toBe("pen");
  const release = registry.registerTool({
    id: "pan-preset",
    title: "Pan preset",
    group: "shapes",
    createTool: (options) => new EdgelessTool(options),
  });
  a.activate("pan-preset");
  expect(a.getGroupTool("shapes")?.id).toBe("pan-preset");
  release();
  expect(a.active?.id).toBe("select");
  expect(b.active?.id).toBe("pen");
  expect(a.getGroupTool("shapes")?.id).toBe("rectangle");
  a.activate("pan");
  const releaseLate = registry.registerTool({
    id: "late-pan",
    title: "Late pan",
    createTool: (options) => new EdgelessTool(options),
  });
  a.activate("late-pan");
  releaseLate();
  expect(a.active?.id).toBe("select");
  expect(notifications).toBe(0);
  stop();
  stopA();
  stopB();
  second.destroy();
  await first.editor.destroy();
  await core.destroy();
});

it("bridges element creation atomically and rolls back definition installation on toolbar conflicts", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const registry = panel.editor.edgelessToolbar;
  const registration = {
    definition: { type: "badge" },
    render: () => null,
    creation: { title: "Badge", group: "diagrams", order: 2, create: () => ({ type: "badge" }) },
  };
  const conflict = registry.registerTool({
    id: "element:badge",
    title: "Conflict",
    createTool: (options) => new EdgelessTool(options),
  });
  expect(() => panel.editor.elementTypes.register(registration)).toThrow(/already exists/);
  expect(core.elementRegistry.get("badge")).toBeUndefined();
  expect(panel.editor.elementTypes.get("badge")).toBeUndefined();
  conflict();
  const release = panel.editor.elementTypes.register(registration);
  expect(registry.getTool("element:badge")).toMatchObject({
    title: "Badge",
    group: "diagrams",
    order: 2,
  });
  release();
  expect(registry.getTool("element:badge")).toBeUndefined();
  await panel.editor.destroy();
  await core.destroy();
});
