import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperProps } from "../../blocks";
import {
  BLOCK_FLOW_SLOT_POSITIONS,
  SLOT_POSITIONS,
  type BlockSlotPosition,
  type BlockSlotProps,
  type ElementSlotProps,
  type SlotPosition,
} from "./types";
import { createReactEditor } from "../../react-editor";

const Surface: ComponentType = () => null;
const Wrapper: ComponentType<BlockWrapperProps> = () => null;
const EditorWrapper: ComponentType<{ readonly children?: ReactNode }> = ({ children }) => children;
const LowBlockSlot: ComponentType<BlockSlotProps> = () => null;
const HighBlockSlot: ComponentType<BlockSlotProps> = () => null;
const EqualBlockSlot: ComponentType<BlockSlotProps> = () => null;
const ElementSlot: ComponentType<ElementSlotProps> = () => null;

describe("SurfaceManager", () => {
  test("keeps surfaces unique and filters defensive wrapper reads by mode", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.surfaces;
    manager.register("block", Surface);
    manager.registerBlockWrapper("block", Wrapper);
    manager.registerEditorWrapper(EditorWrapper, "edgeless");

    expect(manager.get("block")).toBe(Surface);
    expect(() => manager.register("block", Surface)).toThrow(/already registered/);
    const wrappers = manager.getBlockWrappers("block") as ComponentType<BlockWrapperProps>[];
    wrappers.length = 0;
    expect(manager.getBlockWrappers("block")).toEqual([Wrapper]);
    expect(manager.getEditorWrappers("block")).toEqual([]);
    expect(manager.getEditorWrappers("edgeless")).toEqual([EditorWrapper]);
    expect(manager.delete("block")).toBe(true);
    expect(manager.delete("block")).toBe(false);
    expect(manager.get("block")).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("orders and filters block and element slot registrations", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.surfaces;
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Slot owner" });
    const block = editor.blocks.getBlock(blockId)!;
    const elementId = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 0, y: 0, width: 100, height: 80 },
      zIndex: 1,
    });
    const element = editor.elements.getElement(elementId)!;

    expect(SLOT_POSITIONS).toHaveLength(12);
    expect(new Set(SLOT_POSITIONS).size).toBe(12);
    expect(BLOCK_FLOW_SLOT_POSITIONS).toEqual(["start", "end"]);

    manager.registerBlockSlot({ position: "start", component: LowBlockSlot });
    manager.registerBlockSlot({ position: "left", priority: 10, component: LowBlockSlot });
    manager.registerBlockSlot({ position: "left", priority: 20, component: HighBlockSlot });
    manager.registerBlockSlot({ position: "left", priority: 20, component: EqualBlockSlot });
    manager.registerBlockSlot({ position: "left", component: LowBlockSlot, mode: "edgeless" });
    manager.registerBlockSlot({ position: "left", component: LowBlockSlot, when: () => false });
    const disposeElement = manager.registerElementSlot({
      position: "top-left",
      component: ElementSlot,
      mode: "edgeless",
      when: ({ selected }) => selected,
    });

    const blockProps = { block, mode: "block" as const, selected: false };
    expect(manager.getBlockSlots("left", blockProps)).toEqual([
      HighBlockSlot,
      EqualBlockSlot,
      LowBlockSlot,
    ]);
    expect(manager.getBlockSlots("right", blockProps)).toEqual([]);
    expect(manager.getBlockSlots("start", blockProps)).toEqual([LowBlockSlot]);
    expect(manager.getElementSlots("top-left", { element, mode: "edgeless", selected: true }))
      .toEqual([ElementSlot]);
    expect(manager.getElementSlots("top-left", { element, mode: "edgeless", selected: false }))
      .toEqual([]);
    disposeElement();
    expect(manager.getElementSlots("top-left", { element, mode: "edgeless", selected: true }))
      .toEqual([]);

    expect(() => manager.registerBlockSlot({
      position: "middle" as BlockSlotPosition,
      component: LowBlockSlot,
    })).toThrow(/Unsupported slot position/);
    expect(() => manager.registerElementSlot({
      position: "start" as SlotPosition,
      component: ElementSlot,
    })).toThrow(/Unsupported slot position/);
    expect(() => manager.registerElementSlot({
      position: "left",
      priority: Number.POSITIVE_INFINITY,
      component: ElementSlot,
    })).toThrow(/priority must be finite/);
    reactEditor.destroy();
    editor.destroy();
  });
});
