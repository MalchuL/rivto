import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../../react-editor";
import { edgelessSelectionExtension } from "../../built-ins/built-ins";
import { edgelessVisualsExtension } from ".";
import { separatorBlockExtension } from "../../separator/separator-block";
import { EdgelessVisualController } from "./controller";

describe("edgelessVisualsExtension", () => {
  test("keeps canvas selection separate and persists visuals as first-class elements", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Page" });
    editor.selection.set([{ type: "text", anchor: { blockId, offset: 2 }, head: { blockId, offset: 2 } }]);
    const reactEditor = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      edgelessVisualsExtension({ toolbar: false }),
    ] });

    const first = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 20, width: 40, height: 30 } }) as string;
    const second = editor.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 90, y: 50, width: 20, height: 20 } }) as string;
    expect(editor.selection.get()).toEqual([{ type: "text", anchor: { blockId, offset: 2 }, head: { blockId, offset: 2 } }]);
    expect(editor.blocks.getBlocks()).toHaveLength(1);
    expect(editor.dump().elements.map((element) => element.type)).toEqual(["rectangle", "ellipse"]);
    editor.mode.set("block");
    editor.mode.set("edgeless");
    expect(editor.execute("edgeless.selection.get")).toMatchObject({ active: true, items: [second] });
    expect(editor.selection.get()[0]).toMatchObject({ type: "text", anchor: { blockId, offset: 2 } });

    editor.execute("edgeless.selection.set", [first, second]);
    const groupId = editor.execute("edgeless.selection.group") as string;
    const third = editor.execute("edgeless.visual.create", { kind: "text", text: "Canvas" }) as string;
    editor.execute("edgeless.selection.set", [groupId, third]);
    editor.execute("edgeless.selection.group");
    editor.execute("edgeless.selection.move", { dx: 5, dy: 7 });

    const visuals = editor.elements.getElements().filter((element) => element.type !== "group");
    expect(visuals).toHaveLength(3);
    expect(visuals.find((visual) => visual.id === first)?.frame).toMatchObject({ x: 15, y: 27 });
    expect(editor.elements.getElements().filter((element) => element.type === "group")).toHaveLength(2);

    reactEditor.destroy();
    expect(editor.commands.has("edgeless.visual.create")).toBe(false);
    editor.destroy();
  });

  test("nests groups: group+shape, siblings inside a parent, and rejects mixed parents", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({
      editor,
      extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })],
    });
    const a = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 0, y: 0, width: 40, height: 40 } }) as string;
    const b = editor.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 80, y: 0, width: 40, height: 40 } }) as string;
    const c = editor.execute("edgeless.visual.create", { kind: "text", text: "C", frame: { x: 200, y: 0, width: 60, height: 40 } }) as string;
    const d = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 300, y: 0, width: 40, height: 40 } }) as string;

    editor.execute("edgeless.selection.set", [a, b]);
    const inner = editor.execute("edgeless.selection.group") as string;
    expect(editor.execute("edgeless.selection.get")).toMatchObject({ items: [inner] });
    expect(editor.elements.getElement(inner)?.props.children).toEqual([a, b]);

    // Outer nest: existing group + another top-level shape.
    editor.execute("edgeless.selection.set", [inner, c]);
    const outer = editor.execute("edgeless.selection.group") as string;
    expect(editor.elements.getElement(outer)?.props.children).toEqual([inner, c]);
    expect(editor.elements.getElement(inner)?.props.children).toEqual([a, b]);
    expect(editor.execute("edgeless.selection.get")).toMatchObject({ items: [outer] });

    // Same-parent nest inside the outer group (inner group + sibling c already nested;
    // ungroup outer first so c is top-level again, then build a fresh parent of three).
    editor.execute("edgeless.selection.ungroup");
    expect(editor.execute("edgeless.selection.get")).toMatchObject({ items: [inner, c] });
    editor.execute("edgeless.selection.set", [inner, c, d]);
    const wide = editor.execute("edgeless.selection.group") as string;
    expect(editor.elements.getElement(wide)?.props.children).toEqual([inner, c, d]);

    // Drill: group two direct children that share `wide` as parent.
    editor.execute("edgeless.selection.set", [c, d]);
    const nested = editor.execute("edgeless.selection.group") as string;
    expect(editor.elements.getElement(wide)?.props.children).toEqual([inner, nested]);
    expect(editor.elements.getElement(nested)?.props.children).toEqual([c, d]);

    // Mixed parents (inner child + top-level leftover) must fail.
    const e = editor.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 400, y: 0, width: 40, height: 40 } }) as string;
    editor.execute("edgeless.selection.set", [a, e]);
    expect(() => editor.execute("edgeless.selection.group")).toThrow(/share one parent/);

    reactEditor.destroy();
    editor.destroy();
  });

  test("aligns and reorders a mixed block and visual selection", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph" });
    const blockElementId = editor.elements.insertElement({ type: "block", frame: { x: 100, y: 30, width: 100, height: 80 }, zIndex: 0, props: { startBlockId: blockId, endBlockId: blockId } });
    const reactEditor = createReactEditor({ editor, extensions: [separatorBlockExtension(), edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const visualId = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 80, width: 20, height: 20 } }) as string;
    editor.execute("edgeless.selection.set", [blockElementId, visualId]);
    editor.execute("edgeless.selection.align", { alignment: "left" });
    editor.execute("edgeless.selection.reorder", { direction: "front" });

    expect(editor.elements.getElement(blockElementId)?.frame.x).toBe(10);
    expect(editor.elements.getElement(visualId)?.frame.x).toBe(10);
    expect(Math.min(editor.elements.getElement(blockElementId)!.zIndex, editor.elements.getElement(visualId)!.zIndex)).toBeGreaterThanOrEqual(0);
    editor.execute("edgeless.visual.delete", { selection: true });
    expect(editor.blocks.getBlock(blockId)).toBeUndefined();
    expect(editor.elements.getElement(visualId)).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("duplicates a mixed nested group and block element through clipboard remapping", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Card" });
    const blockElementId = editor.elements.insertElement({
      type: "block",
      frame: { x: 200, y: 80, width: 240, height: 120 },
      zIndex: 0,
      props: { startBlockId: blockId, endBlockId: blockId },
    });
    const reactEditor = createReactEditor({ editor, extensions: [separatorBlockExtension(), edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const one = editor.execute("edgeless.visual.create", { kind: "text", text: "One" }) as string;
    const two = editor.execute("edgeless.visual.create", { kind: "sticker", text: "Remember" }) as string;
    editor.execute("edgeless.selection.set", [one, two]);
    const originalGroup = editor.execute("edgeless.selection.group") as string;
    editor.execute("edgeless.selection.set", [originalGroup, blockElementId]);
    const duplicated = editor.execute("edgeless.visual.duplicate") as string[];

    expect(editor.elements.getElements().filter((element) => element.type !== "group")).toHaveLength(6);
    expect(editor.elements.getElements().filter((element) => element.type === "group")).toHaveLength(2);
    expect(editor.blocks.getBlocks().filter((block) => block.content === "Card")).toHaveLength(2);
    expect(duplicated).toHaveLength(2);
    expect(editor.elements.getElement(duplicated[0]!)?.type).toBe("group");
    expect(editor.elements.getElement(duplicated[1]!)?.type).toBe("block");
    expect(duplicated[0]).not.toBe(originalGroup);
    reactEditor.destroy();
    editor.destroy();
  });

  test("persists drawing presets, styled stickies, and attached connectors", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const rectangle = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 20, width: 80, height: 60 } }) as string;
    const sticky = editor.execute("edgeless.visual.create", { kind: "sticker", text: "Plan", fill: "#ffd9e8", frame: { x: 200, y: 40, width: 120, height: 90 } }) as string;
    const drawing = editor.execute("edgeless.visual.create", { kind: "drawing", brush: "marker", frame: { x: 0, y: 0, width: 20, height: 10 }, points: [{ x: 0, y: 0 }, { x: 20, y: 10 }] }) as string;
    const connector = editor.execute("edgeless.visual.create", {
      kind: "connector",
      source: { elementId: rectangle, anchor: { x: 1, y: .5 }, position: { x: 90, y: 50 } },
      target: { elementId: sticky, anchor: { x: 0, y: .5 }, position: { x: 200, y: 85 } },
      route: "curve",
      lineStyle: "dashed-animated",
    }) as string;

    expect(editor.elements.getElement(sticky)?.props).toMatchObject({ text: "Plan", fill: "#ffd9e8" });
    expect(editor.elements.getElement(drawing)?.props).toMatchObject({ brush: "marker", opacity: .34, strokeWidth: 16 });
    expect(editor.elements.getElement(connector)?.props).toMatchObject({
      route: "curve",
      lineStyle: "dashed-animated",
      source: { elementId: rectangle },
      target: { elementId: sticky },
    });
    editor.execute("edgeless.selection.set", [rectangle]);
    editor.execute("edgeless.selection.move", { dx: 20, dy: 5 });
    expect((editor.elements.getElement(connector)?.props.source as { position: { x: number; y: number } }).position).toEqual({ x: 110, y: 55 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("stores editable labels on shapes and connectors", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const shape = editor.execute("edgeless.visual.create", {
      kind: "ellipse",
      text: "Node",
      align: "center",
      fontSize: 18,
    }) as string;
    const other = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 300 } }) as string;
    const connector = editor.execute("edgeless.visual.create", {
      kind: "connector",
      text: "link",
      source: { elementId: shape, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } },
      target: { elementId: other, anchor: { x: 0, y: .5 }, position: { x: 300, y: 180 } },
    }) as string;
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ text: "Node", align: "center", fontSize: 18 });
    expect(editor.elements.getElement(connector)?.props).toMatchObject({ text: "link" });
    editor.execute("edgeless.visual.update", { id: shape, patch: { text: "Updated", align: "left" } });
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ text: "Updated", align: "left" });
    editor.execute("edgeless.visual.update", { id: shape, patch: { filled: false, stroked: false } });
    expect(editor.elements.getElement(shape)?.props).toMatchObject({ filled: false, stroked: false, fill: expect.any(String), stroke: expect.any(String) });
    expect(() => editor.execute("edgeless.tool.set", { tool: "pan" })).not.toThrow();
    expect(() => editor.execute("edgeless.tool.set", "select")).not.toThrow();
    expect(() => editor.execute("edgeless.tool.set", { tool: "place", kind: "rectangle" })).not.toThrow();
    expect(() => editor.execute("edgeless.tool.set", { tool: "place", kind: "ellipse" })).not.toThrow();
    const blank = editor.execute("edgeless.visual.create", {
      kind: "connector",
      source: { elementId: shape, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } },
      target: { elementId: other, anchor: { x: 0, y: .5 }, position: { x: 300, y: 180 } },
    }) as string;
    expect(editor.elements.getElement(blank)?.props.text).toBe("");
    reactEditor.destroy();
    editor.destroy();
  });

  test("remembers last place and drawing tools per category", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    // Selection only — exercise category memory on a dedicated controller instance.
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension()] });
    const controller = new EdgelessVisualController(reactEditor, { toolbar: false });
    controller.setPlaceTool({ kind: "ellipse" });
    expect(controller.getTool()).toEqual({ tool: "place", kind: "ellipse" });
    expect(controller.getLastTool("shapes")).toEqual({ tool: "place", kind: "ellipse" });
    controller.setDrawingBrush("marker");
    expect(controller.getLastTool("drawing")).toEqual({ tool: "drawing", brush: "marker" });
    editor.execute("edgeless.tool.set", "select");
    expect(controller.getTool()).toEqual({ tool: "select" });
    controller.activateCategory("shapes");
    expect(controller.getTool()).toEqual({ tool: "place", kind: "ellipse" });
    controller.activateCategory("drawing");
    expect(controller.getTool()).toEqual({ tool: "drawing", brush: "marker" });
    controller.destroy();
    reactEditor.destroy();
    editor.destroy();
  });

  test("detaches orphan connectors by default and can delete them", () => {
    const setup = (orphanConnectors: "detach" | "delete") => {
      const editor = createRivtoEditor({ mode: "edgeless" });
      const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false, orphanConnectors })] });
      const one = editor.execute("edgeless.visual.create", { kind: "rectangle" }) as string;
      const two = editor.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 400 } }) as string;
      const connector = editor.execute("edgeless.visual.create", { kind: "connector", source: { elementId: one, anchor: { x: 1, y: .5 }, position: { x: 280, y: 180 } }, target: { elementId: two, anchor: { x: 0, y: .5 }, position: { x: 400, y: 180 } } }) as string;
      editor.elements.removeElement(one);
      return { editor, reactEditor, connector };
    };
    const detached = setup("detach");
    expect(detached.editor.elements.getElement(detached.connector)?.props.source).toMatchObject({ elementId: undefined });
    detached.reactEditor.destroy(); detached.editor.destroy();
    const deleted = setup("delete");
    expect(deleted.editor.elements.getElement(deleted.connector)).toBeUndefined();
    deleted.reactEditor.destroy(); deleted.editor.destroy();
  });
});
