import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../../react-editor";
import { edgelessSelectionExtension } from "../../built-ins/built-ins";
import { edgelessVisualsExtension } from ".";

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

  test("aligns and reorders a mixed block and visual selection", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph" });
    const blockElementId = editor.elements.insertElement({ type: "block", frame: { x: 100, y: 30, width: 100, height: 80 }, zIndex: 0, props: { startBlockId: blockId, endBlockId: blockId } });
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
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
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const one = editor.execute("edgeless.visual.create", { kind: "text", text: "One" }) as string;
    const two = editor.execute("edgeless.visual.create", { kind: "sticker", source: { type: "emoji", value: "⭐" } }) as string;
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
});
