import { createTestReactEditor as createReactEditor } from "../../../test-utils";
import { createCaretSelection, type EditorElement as EditorElementMutationResult } from "@chulane/rivto";
import { createTestCoreEditor as createRivtoEditor } from "../../../test-utils";

import { edgelessSelectionExtension } from "..";
import { edgelessVisualsExtension } from "./";
import { separatorBlockExtension } from "../../built-ins/separator/separator-block";
import { createTestMultiEditor } from "../../../test-utils";
import { PageSurface } from "../../../surfaces/page/page-surface";
import { EdgelessSurface } from "../surface/edgeless-surface";
import { EdgelessVisualController } from "./controller";

describe("edgelessVisualsExtension", () => {
  test("stores canvas selection in generic core selection and persists visuals", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Page" }).id;
    const extension = edgelessVisualsExtension({ toolbar: false });
    const editorView = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      extension,
    ] });

    editorView.selection.set(createCaretSelection(blockId, 2));


    const first = extension.createRectangle({ frame: { x: 10, y: 20, width: 40, height: 30 }, rotation: 375 });
    const second = extension.createEllipse({ frame: { x: 90, y: 50, width: 20, height: 20 } });
    expect(editorView.selection.get()).toMatchObject({
      type: "selection",
      blocks: [],
      elements: [second.id],
      pluginData: { edgelessSelection: { active: true } },
    });
    expect(editor.blocks.getBlocks()).toHaveLength(1);
    expect(editor.dump().elements.map((element) => element.type)).toEqual(["rectangle", "ellipse"]);
    expect(editor.elements.getElement(first.id)?.props.rotation).toBe(15);
    expect(editor.mode.get()).toBe("edgeless");
    expect(editor.commands.execute("edgeless.selection.get")).toMatchObject({ active: true, items: [second.id] });
    expect(editorView.selection.get()).toMatchObject({
      type: "selection",
      blocks: [],
      elements: [second.id],
    });

    extension.select([first.id, second.id]);
    const group = extension.group();
    const third = extension.createText({ text: "Canvas" });
    extension.select([group.id, third.id]);
    extension.group();
    editor.commands.execute("edgeless.selection.move", { dx: 5, dy: 7 });

    const visuals = editor.elements.getElements().filter((element) => element.type !== "group");
    expect(visuals).toHaveLength(3);
    expect(visuals.find((visual) => visual.id === first.id)?.frame).toMatchObject({ x: 15, y: 27 });
    expect(editor.elements.getElements().filter((element) => element.type === "group")).toHaveLength(2);



    editorView.destroy();
    expect(editor.commands.has("edgeless.visual.create")).toBe(false);
    expect(() => extension.createSticker()).toThrow(/not installed/);
    editor.destroy();
  });

  test("nests groups: group+shape, siblings inside a parent, and rejects mixed parents", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({
      editor,
      extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })],
    });
    const a = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 0, y: 0, width: 40, height: 40 } }) as EditorElementMutationResult).id;
    const b = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 80, y: 0, width: 40, height: 40 } }) as EditorElementMutationResult).id;
    const c = (editor.commands.execute("edgeless.visual.create", { kind: "text", text: "C", frame: { x: 200, y: 0, width: 60, height: 40 } }) as EditorElementMutationResult).id;
    const d = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 300, y: 0, width: 40, height: 40 } }) as EditorElementMutationResult).id;

    editor.commands.execute("edgeless.selection.set", [a, b]);
    const inner = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.commands.execute("edgeless.selection.get")).toMatchObject({ items: [inner] });
    expect(editor.elements.getElement(inner)?.props.children).toEqual([a, b]);

    // Outer nest: existing group + another top-level shape.
    editor.commands.execute("edgeless.selection.set", [inner, c]);
    const outer = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.elements.getElement(outer)?.props.children).toEqual([inner, c]);
    expect(editor.elements.getElement(inner)?.props.children).toEqual([a, b]);
    expect(editor.commands.execute("edgeless.selection.get")).toMatchObject({ items: [outer] });

    // Same-parent nest inside the outer group (inner group + sibling c already nested;
    // ungroup outer first so c is top-level again, then build a fresh parent of three).
    editor.commands.execute("edgeless.selection.ungroup");
    expect(editor.commands.execute("edgeless.selection.get")).toMatchObject({ items: [inner, c] });
    editor.commands.execute("edgeless.selection.set", [inner, c, d]);
    const wide = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.elements.getElement(wide)?.props.children).toEqual([inner, c, d]);

    // Drill: group two direct children that share `wide` as parent.
    editor.commands.execute("edgeless.selection.set", [c, d]);
    const nested = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.elements.getElement(wide)?.props.children).toEqual([inner, nested]);
    expect(editor.elements.getElement(nested)?.props.children).toEqual([c, d]);

    // Mixed parents (inner child + top-level leftover) must fail.
    const e = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 400, y: 0, width: 40, height: 40 } }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [a, e]);
    expect(() => editor.commands.execute("edgeless.selection.group")).toThrow(/share one parent/);

    editorView.destroy();
    editor.destroy();
  });

  test("aligns and reorders a mixed block and visual selection", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const blockElementId = editor.elements.insertElement({ type: "block", frame: { x: 100, y: 30, width: 100, height: 80 }, zIndex: 0, props: { startBlockId: blockId, endBlockId: blockId } }).id;
    const editorView = createReactEditor({ editor, extensions: [separatorBlockExtension(), edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const visualId = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 80, width: 20, height: 20 } }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [blockElementId, visualId]);
    editor.commands.execute("edgeless.selection.align", { alignment: "left" });
    editor.commands.execute("edgeless.selection.reorder", { direction: "front" });

    expect(editor.elements.getElement(blockElementId)?.frame.x).toBe(10);
    expect(editor.elements.getElement(visualId)?.frame.x).toBe(10);
    expect(Math.min(editor.elements.getElement(blockElementId)!.zIndex, editor.elements.getElement(visualId)!.zIndex)).toBeGreaterThanOrEqual(0);
    editor.commands.execute("edgeless.visual.delete", { selection: true });
    expect(editor.blocks.hasBlock(blockId)).toBe(false);
    expect(editor.elements.getElement(visualId)).toBeUndefined();
    editorView.destroy();
    editor.destroy();
  });

  test("reorders connectors recursively through nested groups without reversing descendants", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      edgelessVisualsExtension({ toolbar: false }),
    ] });
    const outsideBack = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse" }) as EditorElementMutationResult).id;
    const shape = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle" }) as EditorElementMutationResult).id;
    const outsideFront = (editor.commands.execute("edgeless.visual.create", { kind: "sticker" }) as EditorElementMutationResult).id;
    const connector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      source: { anchor: { x: .5, y: .5 }, position: { x: 0, y: 0 } },
      target: { anchor: { x: .5, y: .5 }, position: { x: 100, y: 100 } },
    }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [shape, connector]);
    const innerGroup = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    const sibling = (editor.commands.execute("edgeless.visual.create", { kind: "text", text: "Sibling" }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [innerGroup, sibling]);
    const outerGroup = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;

    editor.commands.execute("edgeless.selection.reorder", "backward");
    expect([outsideBack, shape, connector, sibling, outsideFront].map((id) => editor.elements.getElement(id)!.zIndex)).toEqual([0, 1, 2, 3, 4]);

    editor.commands.execute("edgeless.selection.set", [outerGroup]);
    editor.commands.execute("edgeless.selection.reorder", "forward");
    expect([outsideBack, outsideFront, shape, connector, sibling].map((id) => editor.elements.getElement(id)!.zIndex)).toEqual([0, 1, 2, 3, 4]);
    editorView.destroy();
    editor.destroy();
  });

  test("automatically groups connectors whose endpoints are inside selected objects", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      edgelessVisualsExtension({ toolbar: false }),
    ] });
    const left = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle" }) as EditorElementMutationResult).id;
    const right = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse" }) as EditorElementMutationResult).id;
    const innerConnector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      text: "inner link",
      source: { elementId: left, anchor: { x: 1, y: .5 }, position: { x: 0, y: 0 } },
      target: { elementId: right, anchor: { x: 0, y: .5 }, position: { x: 100, y: 0 } },
    }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [left, right]);
    const innerGroup = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.elements.getElement(innerGroup)?.props.children).toEqual([left, right, innerConnector]);

    const sticky = (editor.commands.execute("edgeless.visual.create", { kind: "sticker" }) as EditorElementMutationResult).id;
    const outerConnector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      text: "outer link",
      source: { elementId: right, anchor: { x: 1, y: .5 }, position: { x: 100, y: 0 } },
      target: { elementId: sticky, anchor: { x: 0, y: .5 }, position: { x: 200, y: 0 } },
    }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [innerGroup, sticky]);
    const outerGroup = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    expect(editor.elements.getElement(outerGroup)?.props.children).toEqual([innerGroup, sticky, outerConnector]);
    editorView.destroy();
    editor.destroy();
  });

  test("reorders internal connectors omitted by older persisted groups", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      edgelessVisualsExtension({ toolbar: false }),
    ] });
    const left = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle" }) as EditorElementMutationResult).id;
    const right = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse" }) as EditorElementMutationResult).id;
    const connector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      text: "legacy link",
      source: { elementId: left, anchor: { x: 1, y: .5 }, position: { x: 0, y: 0 } },
      target: { elementId: right, anchor: { x: 0, y: .5 }, position: { x: 100, y: 0 } },
    }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [left, right]);
    const group = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    editor.elements.updateElement(group, { props: { children: [left, right] } });
    const covering = (editor.commands.execute("edgeless.visual.create", { kind: "sticker" }) as EditorElementMutationResult).id;

    editor.commands.execute("edgeless.selection.set", [group]);
    editor.commands.execute("edgeless.selection.reorder", "front");

    expect(editor.elements.getElement(connector)!.zIndex).toBeGreaterThan(editor.elements.getElement(covering)!.zIndex);
    editorView.destroy();
    editor.destroy();
  });

  test("duplicates a mixed nested group and block element through clipboard remapping", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Card" }).id;
    const blockElementId = editor.elements.insertElement({
      type: "block",
      frame: { x: 200, y: 80, width: 240, height: 120 },
      zIndex: 0,
      props: { startBlockId: blockId, endBlockId: blockId },
    }).id;
    const editorView = createReactEditor({ editor, extensions: [separatorBlockExtension(), edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const one = (editor.commands.execute("edgeless.visual.create", { kind: "text", text: "One" }) as EditorElementMutationResult).id;
    const two = (editor.commands.execute("edgeless.visual.create", { kind: "sticker", text: "Remember" }) as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [one, two]);
    const originalGroup = (editor.commands.execute("edgeless.selection.group") as EditorElementMutationResult).id;
    editor.commands.execute("edgeless.selection.set", [originalGroup, blockElementId]);
    const duplicated = editor.commands.execute("edgeless.visual.duplicate") as EditorElementMutationResult[];

    expect(editor.elements.getElements().filter((element) => element.type !== "group")).toHaveLength(6);
    expect(editor.elements.getElements().filter((element) => element.type === "group")).toHaveLength(2);
    expect(editor.blocks.getBlocks().filter((block) => block.content === "Card")).toHaveLength(2);
    expect(duplicated).toHaveLength(2);
    expect(editor.elements.getElement(duplicated[0]!.id)?.type).toBe("group");
    expect(editor.elements.getElement(duplicated[1]!.id)?.type).toBe("block");
    expect(duplicated[0]?.id).not.toBe(originalGroup);
    editorView.destroy();
    editor.destroy();
  });

  test("persists drawing presets, styled stickies, and attached connectors", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const rectangle = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 20, width: 80, height: 60 } }) as EditorElementMutationResult).id;
    const sticky = (editor.commands.execute("edgeless.visual.create", { kind: "sticker", text: "Plan", fill: "#ffd9e8", frame: { x: 200, y: 40, width: 120, height: 90 } }) as EditorElementMutationResult).id;
    const drawing = (editor.commands.execute("edgeless.visual.create", { kind: "drawing", brush: "marker", frame: { x: 0, y: 0, width: 20, height: 10 }, points: [{ x: 0, y: 0 }, { x: 20, y: 10 }] }) as EditorElementMutationResult).id;
    const connector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      source: { elementId: rectangle, anchor: { x: 1, y: .5 }, position: { x: 90, y: 50 } },
      target: { elementId: sticky, anchor: { x: 0, y: .5 }, position: { x: 200, y: 85 } },
      route: "curve",
      lineStyle: "dashed-animated",
    }) as EditorElementMutationResult).id;

    expect(editor.elements.getElement(sticky)?.props).toMatchObject({ text: "Plan", fill: "#ffd9e8" });
    expect(editor.elements.getElement(drawing)?.props).toMatchObject({ brush: "marker", opacity: .34, strokeWidth: 16 });
    expect(editor.elements.getElement(connector)?.props).toMatchObject({
      route: "curve",
      lineStyle: "dashed-animated",
      source: { elementId: rectangle },
      target: { elementId: sticky },
    });
    editor.commands.execute("edgeless.selection.set", [rectangle]);
    editor.commands.execute("edgeless.selection.move", { dx: 20, dy: 5 });
    expect((editor.elements.getElement(connector)?.props.source as { position: { x: number; y: number } }).position).toEqual({ x: 110, y: 55 });
    editorView.destroy();
    editor.destroy();
  });

  test("stores editable labels on shapes and connectors", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    const editorView = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const shape = (editor.commands.execute("edgeless.visual.create", {
      kind: "ellipse",
      text: "Node",
      align: "center",
      fontSize: 18,
    }) as EditorElementMutationResult).id;
    const other = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 300 } }) as EditorElementMutationResult).id;
    const connector = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      text: "link",
      source: { elementId: shape, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } },
      target: { elementId: other, anchor: { x: 0, y: .5 }, position: { x: 300, y: 180 } },
    }) as EditorElementMutationResult).id;
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ text: "Node", align: "center", fontSize: 18 });
    expect(editor.elements.getElement(connector)?.props).toMatchObject({ text: "link" });
    editor.commands.execute("edgeless.visual.update", { id: shape, patch: { text: "Updated", align: "left" } });
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ text: "Updated", align: "left" });
    editor.commands.execute("edgeless.visual.update", { id: shape, patch: { filled: false, stroked: false } });
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ filled: false, stroked: false, fill: expect.any(String), stroke: expect.any(String) });
    expect(() => editor.commands.execute("edgeless.tool.set", { tool: "pan" })).not.toThrow();
    expect(() => editor.commands.execute("edgeless.tool.set", "select")).not.toThrow();
    expect(() => editor.commands.execute("edgeless.tool.set", { tool: "place", kind: "rectangle" })).not.toThrow();
    expect(() => editor.commands.execute("edgeless.tool.set", { tool: "place", kind: "ellipse" })).not.toThrow();
    const blank = (editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      source: { elementId: shape, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } },
      target: { elementId: other, anchor: { x: 0, y: .5 }, position: { x: 300, y: 180 } },
    }) as EditorElementMutationResult).id;
    expect(editor.elements.getElement(blank)?.props.text).toBe("");
    editorView.destroy();
    editor.destroy();
  });

  test("remembers last place and drawing tools per category", async () => {
    const editor = await createRivtoEditor({ mode: "edgeless" });
    // Selection only — exercise category memory on a dedicated controller instance.
    const editorView = createReactEditor({ editor, extensions: [edgelessSelectionExtension()] });
    const controller = new EdgelessVisualController(editorView, { toolbar: false });
    controller.setPlaceTool({ kind: "ellipse" });
    expect(controller.getTool()).toEqual({ tool: "place", kind: "ellipse" });
    controller.rememberPlaceSize({ x: 0, y: 0, width: 90, height: 70 });
    expect(controller.getPlaceSize()).toEqual({ width: 90, height: 70 });
    controller.setPlaceTool({ kind: "ellipse" });
    expect(controller.getPlaceSize()).toEqual({ width: 90, height: 70 });
    controller.setPlaceTool({ kind: "rectangle" });
    expect(controller.getPlaceSize()).toEqual({ width: 160, height: 120 });
    expect(controller.getLastTool("shapes")).toEqual({ tool: "place", kind: "rectangle" });
    controller.setDrawingBrush("marker");
    expect(controller.getLastTool("drawing")).toEqual({ tool: "drawing", brush: "marker" });
    editor.commands.execute("edgeless.tool.set", "select");
    expect(controller.getTool()).toEqual({ tool: "select" });
    controller.activateCategory("shapes");
    expect(controller.getTool()).toEqual({ tool: "place", kind: "rectangle" });
    controller.activateCategory("drawing");
    expect(controller.getTool()).toEqual({ tool: "drawing", brush: "marker" });
    controller.destroy();
    editorView.destroy();
    editor.destroy();
  });

  test("detaches orphan connectors by default and can delete them", async () => {
    const setup = async (orphanConnectors: "detach" | "delete") => {
      const editor = await createRivtoEditor({ mode: "edgeless" });
      const editorView = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false, orphanConnectors })] });
      const one = (editor.commands.execute("edgeless.visual.create", { kind: "rectangle" }) as EditorElementMutationResult).id;
      const two = (editor.commands.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 400 } }) as EditorElementMutationResult).id;
      const connector = (editor.commands.execute("edgeless.visual.create", { kind: "connector", source: { elementId: one, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } }, target: { elementId: two, anchor: { x: 0, y: .5 }, position: { x: 400, y: 180 } } }) as EditorElementMutationResult).id;
      editor.elements.removeElement(one);
      return { editor, editorView, connector };
    };
    const detached = await setup("detach");
    expect(detached.editor.elements.getElement(detached.connector)?.props.source).not.toHaveProperty("elementId");
    detached.editorView.destroy(); detached.editor.destroy();
    const deleted = await setup("delete");
    expect(deleted.editor.elements.getElement(deleted.connector)).toBeUndefined();
    deleted.editorView.destroy(); deleted.editor.destroy();
  });
});

test("one visuals controller binds model reads, writes, and selection to different document views", async () => {
  const { DocumentStorage } = await import("@chulane/document-model");
  const { YjsDocumentRegistry } = await import("@chulane/crdt-doc");
  const { createTestReactEditor: createRuntime } = await import("../../../test-utils");
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const a = await storage.create("A");
  const b = await storage.create("B");
  const core = await createTestMultiEditor([a, b], storage, { extensions: [edgelessSelectionExtension()] });
  const runtime = core.getEditor(a.id)!;
  const controller = new EdgelessVisualController(runtime);
  const first = controller;
  const second = new EdgelessVisualController(core.getEditor(b.id)!);
  const rectangle = first.create({ kind: "rectangle" });
  const ellipse = second.create({ kind: "ellipse" });
  expect(first.getVisuals().map(({ id }) => id)).toEqual([rectangle.id]);
  expect(second.getVisuals().map(({ id }) => id)).toEqual([ellipse.id]);
  expect(first.editor.selection.get()?.elements).toEqual([rectangle.id]);
  expect(second.editor.selection.get()?.elements).toEqual([ellipse.id]);
  first.select([rectangle.id]);
  expect(second.editor.selection.get()?.elements).toEqual([ellipse.id]);
  expect(first.editor.selection.get()?.elements).toEqual([rectangle.id]);
  const revision = second.getRevision();
  first.setTool({ tool: "place", kind: "ellipse" });
  expect(second.getTool()).toMatchObject({ tool: "select" });
  expect(second.getRevision()).toBe(revision);
  expect(runtime.getDocument()).toBe(a);
  controller.destroy(); second.destroy(); await core.destroy();
   await storage.destroy();
});

test.each(["block", "edgeless"] as const)("visuals render inside native %s views without a default document", async (mode) => {
  const { DocumentStorage } = await import("@chulane/document-model");
  const { YjsDocumentRegistry } = await import("@chulane/crdt-doc");
  const { createTestReactEditor: createRuntime } = await import("../../../test-utils");
  const { standardPreset } = await import("../../built-ins/built-ins");
  const { edgelessPreset } = await import("..");
  const { EditorView } = await import("../../../editor-view");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const a = await storage.create("A", [{ id: "shared", type: "paragraph", content: "First document" }]);
  const b = await storage.create("B", [{ id: "shared", type: "paragraph", content: "Second document" }]);
  const core = await createTestMultiEditor([a, b], storage, () => ({ extensions: [standardPreset(), ...edgelessPreset(), edgelessVisualsExtension()] }));
  const runtime = core.getEditor(a.id)!;
  await Promise.resolve(); // Allow the loaded models to receive their native block elements.
  const markup = renderToStaticMarkup(createElement("div", null,
    createElement(EditorView, { runtime: runtime}, createElement(mode === "block" ? PageSurface : EdgelessSurface)),
    createElement(EditorView, { runtime: core.getEditor(b.id)! }, createElement(mode === "block" ? PageSurface : EdgelessSurface))));
  expect(markup).toContain("First document");
  expect(markup).toContain("Second document");
  expect(runtime.getDocument()).toBe(a);
  runtime.destroy(); await core.destroy();  await storage.destroy();
});

 test("single editors run canvas commands for their own documents without DOM focus", async () => {
  const { DocumentModelImpl } = await import("@chulane/document-model");
  const { YjsDoc } = await import("@chulane/crdt-doc");
  const { createTestReactEditor: createRuntime } = await import("../../../test-utils");
  const multi = await createTestMultiEditor([new DocumentModelImpl(new YjsDoc("A")), new DocumentModelImpl(new YjsDoc("B"))], undefined, () => ({ extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] }));
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  const first = a.commands.execute("edgeless.visual.create", { kind: "rectangle" }) as EditorElementMutationResult;
  const second = b.commands.execute("edgeless.visual.create", { kind: "ellipse" }) as EditorElementMutationResult;
  expect(a.elements.getElement(first.id)?.type).toBe("rectangle"); expect(a.elements.hasElement(second.id)).toBe(false);
  expect(b.elements.getElement(second.id)?.type).toBe("ellipse"); expect(b.elements.hasElement(first.id)).toBe(false);
  expect(a.selection.get()?.elements).toEqual([first.id]); expect(b.selection.get()?.elements).toEqual([second.id]);
  await multi.destroy();
});
