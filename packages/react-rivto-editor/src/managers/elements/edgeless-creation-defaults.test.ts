import { EdgelessToolContext } from "../edgeless-tools/edgeless-tool-context";
import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals/extension";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { EdgelessCreationDefaults } from "./edgeless-creation-defaults";
import { EdgelessOperations } from "./edgeless-operations";

/**
 * Installs built-in registrations and two operation consumers of one surface session.
 *
 * @returns Isolated document, panel, shared settings and operations with a cleanup function.
 */
async function fixture() {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const first = new EdgelessOperations(panel.editor, panel, defaults);
  const second = new EdgelessOperations(panel.editor, panel, defaults);
  return {
    editor,
    panel,
    defaults,
    first,
    second,
    /**
     * Releases both consumers and their editor resources.
     *
     * @returns Resolves after the React and document editors have been destroyed.
     */
    async dispose() {
      first.destroy();
      second.destroy();
      await panel.editor.destroy();
      await editor.destroy();
    },
  };
}

it("shares declared shape styles and dimensions while isolating type properties and content", async () => {
  const f = await fixture();
  const initial = structuredClone(
    f.panel.editor.elementTypes.get("rectangle")!.definition.defaults,
  );
  const node = f.first.createElement({
    type: "rectangle",
    frame: { x: 10, y: 20, width: 320, height: 180 },
    props: { fill: "#ff0000", cornerRadius: 17, text: "Private label" },
  });
  const ellipse = f.second.createElement({ type: "ellipse" });
  expect(ellipse.frame).toMatchObject({ width: 320, height: 180 });
  expect(ellipse.props).toMatchObject({ fill: "#ff0000", text: "" });
  expect(ellipse.props.cornerRadius).toBeUndefined();
  expect(f.defaults.get({ type: "rectangle" }).props?.cornerRadius).toBe(17);
  expect(f.second.createElement({ type: "text" }).frame.width).toBe(160);
  f.first.updateProperties(node.id, { fontSize: 30, text: "Edited content" });
  expect(f.second.prepareElementCreation({ type: "rectangle" }).props).toMatchObject({
    fontSize: 30,
    text: "",
    cornerRadius: 17,
  });
  expect(f.panel.editor.elementTypes.get("rectangle")!.definition.defaults).toEqual(initial);
  expect(new EdgelessCreationDefaults(f.panel.editor).get({ type: "rectangle" }).frame).toEqual({});
  await f.dispose();
});

it("remembers only committed changed fields and leaves memory unchanged on preview, cancel, failure and undo", async () => {
  const f = await fixture();
  const old = f.first.createElement({ type: "rectangle", props: { fill: "red" } });
  f.second.createElement({ type: "ellipse", props: { fill: "blue" } });
  f.first.updateProperties(old.id, { cornerRadius: 12 });
  expect(f.defaults.get({ type: "rectangle" }).props?.fill).toBe("blue");
  const before = f.defaults.get({ type: "rectangle" });
  f.first.setPropertyPreview([old.id], { cornerRadius: 24, fill: "green" });
  expect(f.defaults.get({ type: "rectangle" })).toEqual(before);
  expect(f.defaults.getGroupPreview("shapes").props?.fill).toBe("green");
  f.first.discardPropertyPreview();
  expect(f.defaults.getGroupPreview("shapes").props?.fill).toBe("blue");
  expect(() => f.first.updateProperties(old.id, { cornerRadius: -1 })).toThrow();
  expect(() => f.first.createElement({ type: "rectangle", props: { cornerRadius: -1 } })).toThrow();
  expect(f.defaults.get({ type: "rectangle" })).toEqual(before);
  f.first.setPropertyPreview([old.id], { cornerRadius: 24 });
  f.first.commitPropertyPreview();
  expect(f.defaults.get({ type: "rectangle" }).props?.cornerRadius).toBe(24);
  f.editor.history.undo();
  expect(f.defaults.get({ type: "rectangle" }).props?.cornerRadius).toBe(24);
  await f.dispose();
});

it("checks settings before writes, notifies once and permits style settings before geometry exists", async () => {
  const f = await fixture();
  let calls = 0;
  const stop = f.defaults.subscribe(() => {
    calls += 1;
  });
  f.defaults.set({ group: "shapes" }, { props: { fill: "red" }, frame: { width: 240 } });
  expect(calls).toBe(1);
  f.defaults.set({ group: "shapes" }, { props: { fill: "red" }, frame: { width: 240 } });
  expect(calls).toBe(1);
  const before = f.defaults.get({ group: "shapes" });
  expect(() =>
    f.defaults.set({ group: "shapes" }, { props: { fill: "green" }, frame: { width: -1 } }),
  ).toThrow();
  expect(() => f.defaults.set({ group: "shapes" }, { props: { text: "Content" } })).toThrow();
  expect(() => f.defaults.set({ group: "shapes" }, { props: { strokeWidth: NaN } })).toThrow();
  expect(f.defaults.get({ group: "shapes" })).toEqual(before);
  expect(calls).toBe(1);
  const tools = new EdgelessToolContext(f.panel, f.defaults);
  tools.activate("marker");
  f.defaults.set({ group: "connectors" }, { props: { strokeWidth: 4 } });
  expect(f.defaults.get({ type: "drawing" }).props?.brush).toBe("marker");
  expect(f.defaults.get({ type: "connector" }).props?.strokeWidth).toBe(4);
  stop();
  await f.dispose();
});

it("uses explicit group policies for custom types and forgets removed registrations", async () => {
  const f = await fixture();
  const releaseGroup = f.panel.editor.edgelessToolbar.registerGroup({
    id: "custom",
    title: "Custom",
    creationDefaults: { props: { color: "green" } },
    rememberedProperties: { props: ["color"], frame: ["width", "height"] },
  });
  const releaseType = f.panel.editor.elementTypes.register({
    definition: { type: "custom", defaults: { color: "red", title: "New", radius: 1 } },
    render: () => null,
    creation: { title: "Custom", group: "custom", create: () => ({ type: "custom" }) },
    rememberedProperties: { props: ["radius"] },
  });
  f.first.createElement({
    type: "custom",
    frame: { x: 0, y: 0, width: 250, height: 90 },
    props: { color: "blue", radius: 5, title: "Content" },
  });
  expect(f.defaults.get({ type: "custom" })).toEqual({
    props: { color: "blue", radius: 5, title: "New" },
    frame: { width: 250, height: 90 },
  });
  expect(
    f.first.prepareElementCreation({ type: "custom", props: { color: "orange" } }).props.color,
  ).toBe("orange");
  releaseType();
  releaseGroup();
  f.panel.editor.edgelessToolbar.registerGroup({ id: "custom", title: "Custom" });
  f.panel.editor.elementTypes.register({
    definition: { type: "custom", defaults: { radius: 2 } },
    render: () => null,
  });
  expect(f.defaults.get({ type: "custom" })).toEqual({ props: { radius: 2 }, frame: {} });
  await f.dispose();
});

it("remembers final programmatic resize dimensions and rejects invalid geometry before settings change", async () => {
  const f = await fixture();
  const node = f.first.createElement({ type: "rectangle" });
  f.first.resize(290, 170);
  expect(f.editor.elements.getElementNode(node.id)!.frame).toMatchObject({
    width: 290,
    height: 170,
  });
  expect(f.defaults.get({ type: "ellipse" }).frame).toEqual({ width: 290, height: 170 });
  const before = f.defaults.get({ type: "rectangle" });
  expect(() => f.first.resize(Infinity, 170)).toThrow();
  expect(f.defaults.get({ type: "rectangle" })).toEqual(before);
  await f.dispose();
});

it.each([1, 200])(
  "publishes bounded settings notifications for %i selected elements and releases observation",
  async (count) => {
    const f = await fixture();
    const tools = new EdgelessToolContext(f.panel, f.defaults);
    const other = new EdgelessToolContext(f.panel);
    const stop = tools.observeChanges();
    const nodes = Array.from({ length: count }, () => f.first.createElement({ type: "rectangle" }));
    let calls = 0;
    const unsubscribe = tools.subscribe(() => {
      calls += 1;
      expect(tools.getGroup("shapes")!.getSettings().props?.fill).toBe("#123456");
    });
    const revision = tools.revision;
    const otherRevision = other.revision;
    f.first.setPropertyPreview(
      nodes.map((node) => node.id),
      { fill: "#123456", strokeWidth: 3 },
    );
    expect(calls).toBe(1);
    expect(tools.revision).toBe(revision + 1);
    expect(f.defaults.get({ group: "shapes" }).props?.fill).not.toBe("#123456");
    f.first.commitPropertyPreview();
    expect(calls).toBe(3);
    expect(other.revision).toBe(otherRevision);
    f.defaults.set({ group: "shapes" }, { props: { fill: "#123456", strokeWidth: 3 } });
    expect(calls).toBe(3);
    unsubscribe();
    stop();
    stop();
    const stoppedRevision = tools.revision;
    f.defaults.set({ group: "shapes" }, { props: { fill: "#abcdef" } });
    expect(tools.revision).toBe(stoppedRevision);
    const stopAgain = tools.observeChanges();
    const resumedRevision = tools.revision;
    f.defaults.set({ group: "shapes" }, { props: { fill: "#123456" } });
    expect(tools.revision).toBe(resumedRevision + 1);
    stopAgain();
    await f.dispose();
  },
);
