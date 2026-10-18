import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals/extension";
import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ReactPanel } from "../../panels/react-panel";
import { EdgelessOperations } from "./edgeless-operations";

const observedOperations: EdgelessOperations[] = [];
function observeOperations(panel: ReactPanel): EdgelessOperations {
  const operations = new EdgelessOperations(panel.editor, panel);
  operations.observeChanges();
  observedOperations.push(operations);
  return operations;
}
afterEach(() => {
  observedOperations.splice(0).forEach((operations) => operations.destroy());
});

it("installs an element atomically and cleans up without deleting persisted data", async () => {
  const editor = await createTestCoreEditor();
  const reactPanel = createTestReactEditor({ editor });
  const reactPanelOperations = observeOperations(reactPanel);
  const registration = {
    definition: { type: "badge", defaults: { title: "Badge" } },
    render: () => <span>Badge</span>,
    clipboard: { copy: () => ({ props: { title: "Copied" } }) },
  };
  const dispose = reactPanel.editor.elementTypes.register(registration);
  const node = reactPanelOperations.createElement({
    type: "badge",
    frame: { x: 0, y: 0, width: 10, height: 10 },
    zIndex: 0,
  });
  expect(node.props.title).toBe("Badge");
  expect(() => reactPanel.editor.elementTypes.register(registration)).toThrow();
  dispose();
  dispose();
  expect(reactPanel.editor.elementTypes.get("badge")).toBeUndefined();
  expect(editor.elementRegistry.get("badge")).toBeUndefined();
  expect(editor.elements.getElementNode(node.id)?.props.title).toBe("Badge");
  expect(() => reactPanelOperations.createElement({ type: "badge", zIndex: 0 })).toThrow(
    /not registered/,
  );
  reactPanel.editor.elementTypes.register({
    definition: { type: "shape", defaults: { title: "Custom shape" } },
    render: () => null,
  });
  expect(reactPanelOperations.createElement({ type: "shape" }).props).toEqual({
    title: "Custom shape",
  });
  const stopConflict = reactPanel.editor.clipboard.registerElementConverter("conflict", {});
  expect(() =>
    reactPanel.editor.elementTypes.register({ ...registration, definition: { type: "conflict" } }),
  ).toThrow();
  expect(editor.elementRegistry.get("conflict")).toBeUndefined();
  stopConflict();
  reactPanel.editor.destroy();
  await editor.destroy();
});

it("keeps tool choice and creation defaults local to independent panels", async () => {
  const editor = await createTestCoreEditor();
  const first = createTestReactEditor({ editor, extensions: [edgelessVisualsExtension()] });
  const firstOperations = observeOperations(first);
  const unregister = first.editor.elementTypes.register({
    definition: { type: "badge" },
    render: () => null,
    creation: { title: "Badge", create: () => ({ type: "badge", zIndex: 0 }) },
  });
  const root = editor.elements.insertElement({
    type: "group",
    frame: { x: 0, y: 0, width: 10, height: 10 },
    zIndex: 0,
  });
  const second = new ReactPanel(
    first.editor,
    new ChildrenPanel(editor, { rootElementId: root.id }),
  );
  const secondOperations = observeOperations(second);
  const closeSecond = second.destroy;
  firstOperations.setTool({ tool: "element", type: "badge" });
  expect(secondOperations.getTool()).toEqual({ tool: "select" });
  firstOperations.setCreationDefaults("shape", { fill: "#ff0000" });
  expect(secondOperations.getDefaults().shape.fill).not.toBe("#ff0000");
  secondOperations.setTool({ tool: "pan" });
  const node = secondOperations.createElement({ type: "badge" });
  expect(node.frame).toEqual({ x: 120, y: 120, width: 160, height: 120 });
  expect(node.zIndex).toBe(1);
  expect(editor.elements.getParentId(node.id)).toBe(root.id);
  expect(second.elements.getElementNode(root.id)).toBeUndefined();
  const red = firstOperations.createElement({ type: "rectangle" });
  const plain = secondOperations.createElement({ type: "rectangle" });
  expect(red.props.fill).toBe("#ff0000");
  expect(plain.props.fill).toBe(secondOperations.getDefaults().shape.fill);
  expect(first.editor.elementTypes.get("rectangle")?.definition.defaults?.fill).not.toBe("#ff0000");
  editor.commands.execute("edgeless.tool.set", {
    operations: secondOperations,
    payload: { tool: "pan" },
  });
  expect(firstOperations.getTool()).toEqual({ tool: "element", type: "badge" });
  expect(() => editor.commands.execute("edgeless.tool.set", "select")).toThrow(
    /explicit canvas operations/,
  );
  expect(() =>
    editor.commands.execute("edgeless.tool.set", { reactPanel: second, payload: "select" }),
  ).toThrow(/explicit canvas operations/);
  unregister();
  expect(firstOperations.getTool()).toEqual({ tool: "select" });
  expect(secondOperations.getTool()).toEqual({ tool: "pan" });
  closeSecond();
  first.editor.destroy();
  await editor.destroy();
});

it("keeps custom properties separate from canvas identity and rejects foreign panel commands", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const firstOperations = observeOperations(first);
  const second = createTestReactEditor({ editor: secondCore });
  const secondOperations = observeOperations(second);
  first.editor.elementTypes.register({ definition: { type: "badge" }, render: () => null });
  const node = firstOperations.createElement({
    type: "badge",
    props: { id: "property-id", kind: "property-kind", frame: "property-frame" },
    zIndex: 0,
  });
  expect(firstOperations.getVisuals()[0]).toMatchObject({
    id: node.id,
    kind: "badge",
    frame: node.frame,
  });
  expect(() => new EdgelessOperations(first.editor, second)).toThrow(/same React editor/);
  first.editor.extensions.install(edgelessVisualsExtension());
  expect(() =>
    firstCore.commands.execute("edgeless.visual.create", {
      operations: secondOperations,
      payload: { kind: "rectangle" },
    }),
  ).toThrow(/same React editor/);
  expect(secondCore.elements.getElementNodes()).toEqual([]);
  let notifications = 0;
  firstOperations.subscribe(() => notifications++);
  firstOperations.setTool({ tool: "pan" });
  expect(notifications).toBe(1);
  firstOperations.previewProperties([node.id], { title: "Draft" });
  expect(firstOperations.getVisuals()[0]).toMatchObject({ title: "Draft" });
  firstOperations.destroy();
  expect(firstOperations.getVisuals()[0]).not.toHaveProperty("title");
  const notificationsAfterCleanup = notifications;
  first.editor.destroy();
  second.editor.destroy();
  firstOperations.setTool("select");
  expect(notifications).toBe(notificationsAfterCleanup);
  await firstCore.destroy();
  await secondCore.destroy();
});

it("shares validated custom property previews, preserves opaque keys and remembers only opted-in defaults", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const operations = observeOperations(panel);
  panel.editor.elementTypes.register({
    definition: {
      type: "custom-tree",
      defaults: { color: "blue", count: 1, optional: "default" },
      /**
       * Validates the fixture's positive count and rounds it to an integer.
       *
       * @param props - Element properties to validate.
       * @returns Properties with the normalized count.
       * @throws If count is not a number or is below one.
       */
      validate(props) {
        if (typeof props.count !== "number" || props.count < 1) {
          throw new Error("Invalid count");
        }
        return { ...props, count: Math.round(props.count) };
      },
    },
    render: () => null,
    rememberedProperties: ["color"],
  });
  const first = operations.createElement({
    type: "custom-tree",
    props: { id: "opaque", optional: null },
  });
  expect(first.props.optional).toBeNull();
  const second = operations.createElement({ type: "custom-tree" });
  core.history.stopCapturing();
  operations.previewProperties([first.id, second.id], {
    color: "red",
    count: 2.8,
    id: "still-opaque",
  });
  expect(operations.getRenderedElement(first.id)?.props).toMatchObject({
    color: "red",
    count: 3,
    id: "still-opaque",
  });
  expect(core.elements.getElementNode(first.id)?.props.color).toBe("blue");
  expect(() => operations.previewProperties([first.id, second.id], { count: 0 })).toThrow(
    "Invalid count",
  );
  expect(operations.getRenderedElement(second.id)?.props.count).toBe(3);
  operations.commitPropertyPreview();
  expect(core.elements.getElementNode(first.id)?.props.id).toBe("still-opaque");
  expect(core.elements.getElementNode(second.id)?.props.color).toBe("red");
  core.history.undo();
  expect(core.elements.getElementNode(first.id)?.props.color).toBe("blue");
  expect(core.elements.getElementNode(second.id)?.props.color).toBe("blue");
  core.history.redo();
  const third = operations.createElement({ type: "custom-tree" });
  expect(third.props).toMatchObject({ color: "red", count: 1 });
  expect(third.props.id).toBeUndefined();
  operations.previewProperties([third.id], { color: "green" });
  operations.discardPropertyPreview();
  expect(operations.getRenderedElement(third.id)?.props.color).toBe("red");
  panel.editor.destroy();
  await core.destroy();
});

it("validates every preview target before committing and preserves concurrent unrelated properties", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const operations = observeOperations(panel);
  panel.editor.elementTypes.register({
    definition: {
      type: "guarded",
      defaults: { color: "blue" },
      /**
       * Rejects red color changes on the fixture's locked element.
       *
       * @param props - Element properties to validate.
       * @returns The unchanged properties.
       * @throws If a locked element receives red.
       */
      validate(props) {
        if (props.locked && props.color === "red") {
          throw new Error("Locked color");
        }
        return props;
      },
    },
    render: () => null,
  });
  const first = operations.createElement({ type: "guarded" });
  const second = operations.createElement({ type: "guarded" });
  operations.previewProperties([first.id, second.id], { color: "red" });
  core.elements.updateElement(second.id, { props: { locked: true } });
  expect(operations.getRenderedElement(second.id)?.props).toMatchObject({
    color: "blue",
    locked: true,
  });
  expect(operations.getRenderedElements().map((element) => element.props.color)).toEqual([
    "red",
    "blue",
  ]);
  expect(operations.getVisuals().map((element) => element.color)).toEqual(["red", "blue"]);
  expect(() => operations.previewProperties([second.id], { title: "Still invalid" })).toThrow(
    "Locked color",
  );
  expect(() => operations.commitPropertyPreview()).toThrow("Locked color");
  expect(core.elements.getElementNode(first.id)?.props.color).toBe("blue");
  expect(core.elements.getElementNode(second.id)?.props.color).toBe("blue");
  expect(operations.hasPropertyPreview()).toBe(true);
  operations.previewProperties([second.id], { color: "green" });
  expect(operations.getRenderedElement(second.id)?.props).toMatchObject({
    color: "green",
    locked: true,
  });
  operations.discardPropertyPreview();
  operations.previewProperties([first.id], { color: "green" });
  core.elements.updateElement(first.id, { props: { title: "Concurrent title" } });
  operations.commitPropertyPreview();
  expect(core.elements.getElementNode(first.id)?.props).toMatchObject({
    color: "green",
    title: "Concurrent title",
  });
  operations.previewProperties([first.id], { color: "red" });
  core.elements.removeElement(first.id);
  expect(() => operations.commitPropertyPreview()).not.toThrow();
  expect(operations.hasPropertyPreview()).toBe(false);
  panel.editor.destroy();
  await core.destroy();
});

it("prepares detached creation data with the same defaults and normalization as insertion", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const operations = observeOperations(panel);
  let validations = 0;
  const defaults = { nested: { value: 1 }, count: 0 };
  panel.editor.elementTypes.register({
    definition: {
      type: "preview-example",
      defaults,
      /**
       * Counts validation calls and increments the fixture count to detect repeated normalization.
       *
       * @param props - Element properties to validate.
       * @returns Properties with the incremented count.
       */
      validate(props) {
        validations += 1;
        return { ...props, count: Number(props.count) + 1 };
      },
    },
    render: () => null,
    behavior: { create: (input) => ({ ...input, props: { ...input.props, prepared: true } }) },
  });
  const input = {
    type: "preview-example",
    frame: { x: 10, y: 20, width: 220, height: 80 },
    props: { title: "Draft" },
  };
  const before = editor.dump();
  let notifications = 0;
  const stop = editor.subscribe(() => {
    notifications += 1;
  });
  const draft = operations.prepareElementCreation(input);
  expect(draft).toMatchObject({
    type: "preview-example",
    frame: input.frame,
    props: { ...defaults, count: 1, title: "Draft", prepared: true },
  });
  expect(validations).toBe(1);
  expect(notifications).toBe(0);
  expect(editor.dump()).toEqual(before);
  expect(input.props).toEqual({ title: "Draft" });
  (draft.props.nested as { value: number }).value = 42;
  expect(defaults.nested.value).toBe(1);
  const created = operations.createElement(input);
  expect(validations).toBe(2);
  expect(created.props).toEqual({ ...defaults, count: 1, title: "Draft", prepared: true });
  expect(created.frame).toEqual(input.frame);
  expect(notifications).toBeGreaterThan(0);
  stop();
  expect(operations.getPlaceSize({ width: 220, height: 80 })).toEqual({ width: 220, height: 80 });
  operations.rememberPlaceSize({ x: 0, y: 0, width: 300, height: 150 });
  expect(operations.getPlaceSize({ width: 220, height: 80 })).toEqual({ width: 300, height: 150 });
  operations.destroy();
  await panel.editor.destroy();
  await editor.destroy();
});

it("persists rectangle corner radius and rejects invalid updates without changing the element", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [edgelessVisualsExtension()] });
  const operations = observeOperations(panel);
  const rectangle = operations.createElement({ type: "rectangle" });
  expect(rectangle.props.cornerRadius).toBe(3);
  operations.updateProperties(rectangle.id, { cornerRadius: 0 });
  expect(editor.elements.getElementNode(rectangle.id)?.props.cornerRadius).toBe(0);
  for (const cornerRadius of [-1, NaN, Infinity, "12", null]) {
    expect(() => operations.updateProperties(rectangle.id, { cornerRadius })).toThrow(
      /Corner radius/,
    );
    expect(editor.elements.getElementNode(rectangle.id)?.props.cornerRadius).toBe(0);
  }
  expect(operations.createElement({ type: "rectangle" }).props.cornerRadius).toBe(0);
  operations.previewProperties([rectangle.id], { cornerRadius: 24 });
  expect(operations.getRenderedElement(rectangle.id)?.props.cornerRadius).toBe(24);
  expect(editor.elements.getElementNode(rectangle.id)?.props.cornerRadius).toBe(0);
  expect(operations.createElement({ type: "rectangle" }).props.cornerRadius).toBe(0);
  operations.commitPropertyPreview();
  expect(editor.elements.getElementNode(rectangle.id)?.props.cornerRadius).toBe(24);
  expect(operations.prepareElementCreation({ type: "rectangle" }).props.cornerRadius).toBe(24);
  expect(operations.createElement({ type: "rectangle" }).props.cornerRadius).toBe(24);
  expect(operations.createElement({ type: "ellipse" }).props.cornerRadius).toBeUndefined();
  panel.editor.destroy();
  await editor.destroy();
});
