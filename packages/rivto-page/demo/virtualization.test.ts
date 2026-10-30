import { BlockVirtualizationController } from "../src/editor/virtualization/block-virtualization-controller";
import { DemoAdapter } from "./demo-adapter";

describe("virtualized model selection", () => {
  it("indents and outdents selected IDs without any mounted DOM", () => {
    const adapter = new DemoAdapter(200);
    const ids = adapter.blocks.getBlockIds().slice(1, 998);
    adapter.selection.set({
      type: "selection",
      blocks: ids.map((id) => ({ id, start: 0, end: -1 })),
    });
    const selection = adapter.selection.get();
    expect(adapter.changeSelectionIndent(false)).toBe(true);
    expect(adapter.blocks.getBlockIds()).toEqual(["block-1", "block-999", "block-1000"]);
    expect(adapter.blocks.getBlockNode("block-1")?.childIds).toEqual(["child-0", ...ids]);
    expect(adapter.selection.get()).toBe(selection);
    expect(adapter.changeSelectionIndent(true)).toBe(true);
    expect(adapter.blocks.getBlockIds()).toHaveLength(1000);
    expect(adapter.blocks.getBlockIds().slice(1, 998)).toEqual(ids);
    expect(adapter.selection.get()).toBe(selection);
  });

  it("calculates numbering across unmounted roots and observes offscreen decoration", () => {
    const adapter = new DemoAdapter(10);
    const invalidate = jest.fn();
    const controller = new BlockVirtualizationController(
      adapter.blocks,
      adapter.selection,
      invalidate,
    );
    const ids = adapter.blocks.getBlockIds();
    for (const id of ids) {
      adapter.blocks.updateBlockNode(id, { listType: "numbered_list" });
    }
    controller.setBlockIds(ids);
    controller.reconcileListSubscriptions();
    expect(controller.getListNumber("block-50")).toBe(50);
    adapter.blocks.updateBlockNode("block-20", { listType: "start_numbered_list" });
    expect(controller.getListNumber("block-50")).toBe(31);
    expect(invalidate).toHaveBeenCalledTimes(1);
    adapter.setText("block-20", "Updated text");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("selects only a viewport range without mounting structural selection", () => {
    const adapter = new DemoAdapter(200);
    adapter.selection.set({
      type: "selection",
      blocks: adapter.blocks.getBlockIds().map((id) => ({ id, start: 0, end: -1 })),
    });
    const controller = new BlockVirtualizationController(
      adapter.blocks,
      adapter.selection,
      jest.fn(),
    );
    controller.setBlockIds(adapter.blocks.getBlockIds());
    expect(
      controller.getRangeIndices({ startIndex: 500, endIndex: 503, overscan: 2, count: 1000 }),
    ).toEqual([498, 499, 500, 501, 502, 503, 504, 505]);
    expect(adapter.selection.get()?.blocks).toHaveLength(1000);
  });
});

it("releases metadata, observers and the bridge without clearing host selection", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const disconnect = jest.fn();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn(() => ({ observe: jest.fn(), disconnect })),
  });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  try {
    const adapter = new DemoAdapter(1);
    adapter.select("block-2");
    const controller = new BlockVirtualizationController(
      adapter.blocks,
      adapter.selection,
      jest.fn(),
    );
    controller.setBlockIds(adapter.blocks.getBlockIds());
    const detach = controller.attach(root, jest.fn());
    expect(BlockVirtualizationController.getForRoot(root)).toBe(controller);
    expect(adapter.getMetrics().subscriptions).toBe(5);
    detach();
    detach();
    expect(BlockVirtualizationController.getForRoot(root)).toBeUndefined();
    expect(adapter.getMetrics().subscriptions).toBe(0);
    expect(adapter.selection.isBlockSelected("block-2")).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    const detachAgain = controller.attach(root, jest.fn());
    expect(adapter.getMetrics().subscriptions).toBe(5);
    detachAgain();
    expect(adapter.getMetrics().subscriptions).toBe(0);
  } finally {
    root.remove();
    if (previous) {
      Object.defineProperty(globalThis, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});

it("outdents a selected child even after its parent is collapsed", () => {
  const adapter = new DemoAdapter(1);
  adapter.select("child-0");
  adapter.blocks.updateBlockNode("block-1", { collapsed: true });
  expect(adapter.selection.getSelectableBlockIds()).not.toContain("child-0");
  expect(adapter.changeSelectionIndent(true)).toBe(true);
  expect(adapter.blocks.getBlockIds()[1]).toBe("child-0");
  expect(adapter.selection.isBlockSelected("child-0")).toBe(true);
});

it("retains only canonical endpoints when native selection loses its offscreen anchor", () => {
  const adapter = new DemoAdapter(200);
  const ids = adapter.blocks.getBlockIds();
  adapter.selection.set({
    type: "selection",
    blocks: ids.map((id) => ({ id, start: 0, end: 1 })),
    anchorBlockId: ids[0],
    focusBlockId: ids.at(-1),
  });
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  controller.setBlockIds(ids);
  expect(
    controller.getRangeIndices({ startIndex: 500, endIndex: 503, overscan: 2, count: 1000 }),
  ).toEqual([0, 498, 499, 500, 501, 502, 503, 504, 505, 999]);
  adapter.selection.clear();
  expect(
    controller.getRangeIndices({ startIndex: 500, endIndex: 503, overscan: 2, count: 1000 }),
  ).toEqual([498, 499, 500, 501, 502, 503, 504, 505]);
});
