import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../react-editor";
import { edgelessSelectionExtension } from "../built-ins";
import { edgelessVisualsExtension } from ".";
import { EDGELESS_VISUALS_PLUGIN_ID, type EdgelessVisual } from "./types";

describe("edgelessVisualsExtension", () => {
  test("keeps canvas selection separate and persists visuals only in plugin data", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Page", layout: { x: 0, y: 0 } });
    editor.selection.set([{ type: "text", anchor: { blockId, offset: 2 }, head: { blockId, offset: 2 } }]);
    const reactEditor = createReactEditor({ editor, extensions: [
      edgelessSelectionExtension(),
      edgelessVisualsExtension({ toolbar: false }),
    ] });

    const first = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 20, width: 40, height: 30 } }) as string;
    const second = editor.execute("edgeless.visual.create", { kind: "ellipse", frame: { x: 90, y: 50, width: 20, height: 20 } }) as string;
    expect(editor.selection.get()).toEqual([{ type: "text", anchor: { blockId, offset: 2 }, head: { blockId, offset: 2 } }]);
    expect(editor.blocks.getBlocks()).toHaveLength(1);
    expect(editor.dump().pluginData?.[EDGELESS_VISUALS_PLUGIN_ID]).toMatchObject({ version: 1 });
    editor.mode.set("block");
    editor.mode.set("edgeless");
    expect(editor.execute("edgeless.selection.get")).toMatchObject({ active: true, items: [{ kind: "visual", id: second }] });
    expect(editor.selection.get()[0]).toMatchObject({ type: "text", anchor: { blockId, offset: 2 } });

    editor.execute("edgeless.selection.set", [{ kind: "visual", id: first }, { kind: "visual", id: second }]);
    const groupId = editor.execute("edgeless.selection.group") as string;
    const third = editor.execute("edgeless.visual.create", { kind: "text", text: "Canvas" }) as string;
    editor.execute("edgeless.selection.set", [{ kind: "group", id: groupId }, { kind: "visual", id: third }]);
    editor.execute("edgeless.selection.group");
    editor.execute("edgeless.selection.move", { dx: 5, dy: 7 });

    const namespace = editor.document.pluginData.get<Record<string, unknown>>(EDGELESS_VISUALS_PLUGIN_ID)!;
    const visuals = Object.values(namespace.elements as Record<string, EdgelessVisual>);
    expect(visuals).toHaveLength(3);
    expect(visuals.find((visual) => visual.id === first)?.frame).toMatchObject({ x: 15, y: 27 });
    expect(Object.keys(namespace.groups as Record<string, unknown>)).toHaveLength(2);

    reactEditor.destroy();
    expect(editor.commands.has("edgeless.visual.create")).toBe(false);
    editor.destroy();
  });

  test("aligns and reorders a mixed block and visual selection", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const blockId = editor.blocks.insertBlock({ type: "paragraph", layout: { x: 100, y: 30, width: 100, height: 80, zIndex: 0 } });
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const visualId = editor.execute("edgeless.visual.create", { kind: "rectangle", frame: { x: 10, y: 80, width: 20, height: 20 } }) as string;
    editor.execute("edgeless.selection.set", [{ kind: "block", id: blockId }, { kind: "visual", id: visualId }]);
    editor.execute("edgeless.selection.align", { alignment: "left" });
    editor.execute("edgeless.selection.reorder", { direction: "front" });

    const namespace = editor.document.pluginData.get<{ elements: Record<string, EdgelessVisual> }>(EDGELESS_VISUALS_PLUGIN_ID)!;
    expect(editor.blocks.getBlock(blockId)?.layout?.x).toBe(10);
    expect(namespace.elements[visualId]?.frame.x).toBe(10);
    expect(Math.min(editor.blocks.getBlock(blockId)!.layout!.zIndex, namespace.elements[visualId]!.zIndex)).toBeGreaterThanOrEqual(0);
    editor.execute("edgeless.visual.delete", { selection: true });
    expect(editor.blocks.getBlock(blockId)).toBeUndefined();
    expect(editor.document.pluginData.get<{ elements: Record<string, EdgelessVisual> }>(EDGELESS_VISUALS_PLUGIN_ID)?.elements[visualId]).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("duplicates nested structure through the clipboard remapping path", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor, extensions: [edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
    const one = editor.execute("edgeless.visual.create", { kind: "text", text: "One" }) as string;
    const two = editor.execute("edgeless.visual.create", { kind: "sticker", source: { type: "emoji", value: "⭐" } }) as string;
    editor.execute("edgeless.selection.set", [{ kind: "visual", id: one }, { kind: "visual", id: two }]);
    const originalGroup = editor.execute("edgeless.selection.group") as string;
    const duplicated = editor.execute("edgeless.visual.duplicate") as Array<{ kind: string; id: string }>;
    const namespace = editor.document.pluginData.get<{ elements: Record<string, unknown>; groups: Record<string, unknown> }>(EDGELESS_VISUALS_PLUGIN_ID)!;

    expect(Object.keys(namespace.elements)).toHaveLength(4);
    expect(Object.keys(namespace.groups)).toHaveLength(2);
    expect(duplicated).toHaveLength(1);
    expect(duplicated[0]).toMatchObject({ kind: "group" });
    expect(duplicated[0]?.id).not.toBe(originalGroup);
    reactEditor.destroy();
    editor.destroy();
  });
});
