import { renderToStaticMarkup } from "react-dom/server";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { EdgelessTool, type EdgelessToolPointer } from "./edgeless-tool";
import { EdgelessToolContext } from "./edgeless-tool-context";
import { EdgelessCreationTool } from "./edgeless-creation-tool";

/** Arbitrarily named extension behavior requiring no built-in event dispatch. */
class CustomTool extends EdgelessTool {
  override readonly capturesPointer = true;
  samples = 0;
  cancellations = 0;
  activations = 0;

  /**
   * Records lifecycle activation for the test extension.
   *
   * @returns Advances the activation counter without document writes.
   */
  override activate(): void {
    this.activations += 1;
  }

  /**
   * Accepts the extension's pointer gesture.
   *
   * @param _input - First normalized pointer sample.
   * @returns True so the DOM adapter captures the pointer.
   */
  override pointerDown(_input: EdgelessToolPointer): boolean {
    this.samples = 1;
    this.changed();
    return true;
  }

  /**
   * Updates custom preview state independently of the surface's active-tool store.
   *
   * @param _input - Current normalized pointer sample.
   * @returns Publishes the changed sample count.
   */
  override pointerMove(_input: EdgelessToolPointer): void {
    this.samples += 1;
    this.changed();
  }

  /**
   * Drops custom state and records cancellation.
   *
   * @returns Whether any sample was pending.
   */
  override cancel(): boolean {
    const hadSamples = this.samples > 0;
    this.samples = 0;
    this.cancellations += 1;
    this.changed();
    return hadSamples;
  }

  /**
   * Renders extension-owned feedback without inspecting a central preview discriminator.
   *
   * @param _zoom - Current canvas scale.
   * @returns Custom markup showing current gesture state.
   */
  override renderPreview(_zoom: number) {
    return <output data-arbitrary-preview>{this.samples}</output>;
  }
}

/** Primary pointer input with snapping disabled for deterministic geometry. */
const pointer: EdgelessToolPointer = {
  point: { x: 40, y: 50 },
  pointerId: 1,
  button: 0,
  shiftKey: false,
  zoom: 1,
  snapping: { snapToGrid: false, alignObjects: false, disabled: true, threshold: 8 },
};

it("uses arbitrary registered classes, groups and fallback IDs without document writes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const registry = panel.editor.edgelessToolbar;
  registry.registerTool({
    id: "rest",
    title: "Rest",
    default: true,
    createTool: (options) => new CustomTool(options),
  });
  expect(() =>
    registry.registerTool({
      id: "second-default",
      title: "Second default",
      default: true,
      createTool: (options) => new EdgelessTool(options),
    }),
  ).toThrow("A default edgeless tool is already registered");
  const removeGroup = registry.registerGroup({
    id: "experiments",
    title: "Experiments",
    rememberedProperties: { props: ["tone"] },
    creationDefaults: { props: { tone: "warm" } },
  });
  let created: CustomTool | undefined;
  registry.registerTool({
    id: "unfamiliar",
    title: "Custom",
    group: "experiments",
    createTool: (options) => {
      created = new CustomTool(options);
      return created;
    },
  });
  const tools = new EdgelessToolContext(panel);
  const other = new EdgelessToolContext(panel);
  const stop = tools.observeChanges();
  const before = core.dump();
  tools.activate("unfamiliar");
  const tool = created!;
  expect(tools.active).toBe(tool);
  expect(tools.canReset).toBe(true);
  expect(tools.getTool("unfamiliar")).toBe(tool);
  expect(other.getTool("unfamiliar")).not.toBe(tool);
  expect(tool.group).toBe(tools.getGroup("experiments"));
  tool.group!.setSettings({ props: { tone: "cool" } });
  expect(other.getGroup("experiments")!.getSettings().props?.tone).toBe("warm");
  let contextNotifications = 0;
  const unobserve = tools.subscribe(() => {
    contextNotifications += 1;
  });
  tool.pointerDown(pointer);
  tool.pointerMove(pointer);
  expect(renderToStaticMarkup(tool.renderPreview(1))).toContain(">2</output>");
  expect(contextNotifications).toBe(0);
  tools.reset();
  expect(tool.samples).toBe(0);
  expect(tools.active?.id).toBe("rest");
  expect(tools.canReset).toBe(false);
  tools.activate("unfamiliar");
  removeGroup();
  expect(tools.active?.id).toBe("rest");
  expect(tools.canReset).toBe(false);
  expect(tools.getTool("unfamiliar")).toBeUndefined();
  expect(core.dump()).toEqual(before);
  unobserve();
  stop();
  await panel.editor.destroy();
  await core.destroy();
});

it("bridges unchanged element registration and reuses its factory until commit or cancellation", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  let factoryCalls = 0;
  panel.editor.elementTypes.register({
    definition: { type: "ordinary", defaults: { title: "New" } },
    render: () => null,
    rememberedProperties: { frame: ["width", "height"] },
    creation: {
      title: "Ordinary",
      create: () => {
        factoryCalls += 1;
        return {
          type: "ordinary",
          props: { title: `Draft ${factoryCalls}` },
          frame: { x: 0, y: 0, width: 220, height: 80 },
        };
      },
    },
  });
  const tools = new EdgelessToolContext(panel);
  tools.activate("element:ordinary");
  const tool = tools.active!;
  expect(tool).toBeInstanceOf(EdgelessCreationTool);
  if (!(tool instanceof EdgelessCreationTool)) {
    throw new Error("Element registration must provide a creation tool");
  }
  expect(tool.preparePlacement(pointer)?.frame).toMatchObject({ width: 220, height: 80 });
  tool.pointerDown(pointer);
  tool.pointerMove({ ...pointer, point: { x: 340, y: 200 } });
  expect(factoryCalls).toBe(1);
  expect(core.elements.getElementNodes()).toHaveLength(0);
  tool.pointerUp({ ...pointer, point: { x: 340, y: 200 } });
  expect(core.elements.getElementNodes()).toHaveLength(1);
  expect(core.elements.getElementNodes()[0]).toMatchObject({
    props: { title: "Draft 1" },
    frame: { width: 300, height: 150 },
  });
  expect(tool.preparePlacement(pointer)?.frame).toMatchObject({ width: 300, height: 150 });
  tool.cancel();
  expect(factoryCalls).toBe(2);
  expect(core.elements.getElementNodes()).toHaveLength(1);
  await panel.editor.destroy();
  await core.destroy();
});

it("cancels failed activation and invokes the configured fallback lifecycle", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  let fallback: CustomTool | undefined;
  panel.editor.edgelessToolbar.registerTool({
    id: "rest",
    title: "Rest",
    default: true,
    createTool: (options) => {
      fallback = new CustomTool(options);
      return fallback;
    },
  });
  panel.editor.edgelessToolbar.registerTool({
    id: "broken",
    title: "Broken",
    createTool: (options) => {
      const tool = new CustomTool(options);
      tool.activate = () => {
        throw new Error("activation rejected");
      };
      return tool;
    },
  });
  const tools = new EdgelessToolContext(panel);
  expect(() => tools.activate("broken")).toThrow("activation rejected");
  expect(tools.active).toBe(fallback);
  expect(fallback?.activations).toBe(1);
  await panel.editor.destroy();
  await core.destroy();
});

it("defers a grouped fallback and cancels it when its group disappears", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const registry = panel.editor.edgelessToolbar;
  registry.registerTool({
    id: "fallback",
    title: "Fallback",
    group: "deferred",
    default: true,
    createTool: (options) => new CustomTool(options),
  });
  const tools = new EdgelessToolContext(panel);
  const stop = tools.observeChanges();
  expect(tools.active).toBeUndefined();
  expect(tools.canReset).toBe(false);
  const removeGroup = registry.registerGroup({ id: "deferred", title: "Deferred" });
  const previous = tools.active;
  expect(previous?.id).toBe("fallback");
  expect(() => removeGroup()).not.toThrow();
  expect(tools.active).toBeUndefined();
  expect(tools.canReset).toBe(false);
  registry.registerGroup({ id: "deferred", title: "Restored" });
  expect(tools.active?.id).toBe("fallback");
  expect(tools.active).not.toBe(previous);
  stop();
  await panel.editor.destroy();
  await core.destroy();
});
