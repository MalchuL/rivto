import type { BlockListType } from "../../adapter/types";
import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";

it("keeps node identity separate from live snapshots and delegates presentation commands", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a", { childIds: ["child"], checked: false, collapsed: false, color: "red" });
  adapter.setBlockIds(["a"]);
  const controller = new BlockEditorController({ adapter });
  const node = controller.getNode("a");
  const snapshot = adapter.nodes.get("a");
  expect(node.getSnapshot()).toBe(snapshot);
  expect(node.getSnapshot()).toBe(snapshot);
  expect(node.childIds).toBe(snapshot!.childIds);
  expect(node.type).toBe("text");
  const changed = jest.fn();
  const dispose = node.subscribe(changed);
  node.setChecked(true);
  expect(node.checked).toBe(true);
  expect(node.collapsed).toBe(false);
  expect(node.color).toBe("red");
  node.setCollapsed(true);
  node.setColor("blue");
  expect(node.checked).toBe(true);
  expect(node.collapsed).toBe(true);
  expect(node.color).toBe("blue");
  node.setColor(null);
  expect(node.color).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(4);
  expect(adapter.blocks.updateBlockNode.mock.calls).toEqual([
    ["a", { checked: true }],
    ["a", { collapsed: true }],
    ["a", { color: "blue" }],
    ["a", { color: null }],
  ]);
  expect(controller.getNode("a")).toBe(node);
  expect(node.getSnapshot()).not.toBe(snapshot);
  expect(snapshot?.checked).toBe(false);
  expect(snapshot?.collapsed).toBe(false);
  expect(snapshot?.color).toBe("red");
  dispose();
  dispose();
  expect(adapter.subscriberCount).toBe(0);
  controller.destroy();
});

it.each([5, 2000])(
  "reuses %i cached nodes without reads, subscriptions or replacement objects",
  (count) => {
    const adapter = new TestBlockEditorAdapter();
    const controller = new BlockEditorController({ adapter });
    const ids = Array.from({ length: count }, (_, index) => `node-${index}`);
    for (const id of ids) {
      adapter.setNode(id);
    }
    adapter.setBlockIds(ids);
    const snapshots = new Map(adapter.nodes);
    const nodes = ids.map((id) => controller.getNode(id));
    expect(new Set(nodes).size).toBe(count);
    expect(adapter.blocks.getBlockNode).not.toHaveBeenCalled();
    expect(adapter.subscriberCount).toBe(0);
    for (let pass = 0; pass < 5; pass++) {
      ids.forEach((id, index) => expect(controller.getNode(id)).toBe(nodes[index]));
    }
    expect(adapter.blocks.getBlockNode).not.toHaveBeenCalled();
    const changed = jest.fn();
    nodes[0]!.subscribe(changed);
    adapter.blocks.getBlockNode.mockClear();
    adapter.blocks.getBlockIds.mockClear();
    nodes[0]!.setListType("numbered_list");
    expect(nodes[0]!.listType).toBe("numbered_list");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(adapter.blocks.getBlockNode.mock.calls.map(([id]) => id)).toEqual([ids[0], ids[0]]);
    expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
    ids.forEach((id, index) => expect(controller.getNode(id)).toBe(nodes[index]));
    for (const id of ids.slice(1)) {
      expect(adapter.nodes.get(id)).toBe(snapshots.get(id));
    }
    controller.destroy();
    expect(nodes[0]!.getSnapshot()).toBeUndefined();
    expect(adapter.nodes.size).toBe(count);
  },
);

it("observes missing IDs and preserves their objects across deletion and restoration", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setBlockIds(["later"]);
  const controller = new BlockEditorController({ adapter });
  const node = controller.getNode("later");
  const changed = jest.fn();
  node.subscribe(changed);
  expect(node.id).toBe("later");
  expect(node.getSnapshot()).toBeUndefined();
  expect(node.checked).toBeUndefined();
  expect(() => node.setChecked(true)).toThrow("unavailable");
  expect(() => node.setListType("numbered_list")).toThrow("unavailable");
  expect(adapter.blocks.updateBlockNode).not.toHaveBeenCalled();
  adapter.setNode("later");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(node.type).toBe("text");
  adapter.deleteNode("later");
  expect(node.getSnapshot()).toBeUndefined();
  expect(node.childIds).toBeUndefined();
  adapter.setNode("later", { checked: true });
  expect(controller.getNode("later")).toBe(node);
  expect(node.checked).toBe(true);
  const snapshot = node.getSnapshot();
  const rejected = new Error("Host rejected color");
  adapter.blocks.updateBlockNode.mockImplementationOnce(() => {
    throw rejected;
  });
  expect(() => node.setColor("invalid")).toThrow(rejected);
  expect(node.getSnapshot()).toBe(snapshot);
  adapter.blocks.updateBlockNode.mockImplementationOnce(() => {
    throw rejected;
  });
  expect(() => node.setListType("numbered_list")).toThrow(rejected);
  expect(node.getSnapshot()).toBe(snapshot);
  controller.destroy();
  expect(adapter.subscriberCount).toBe(0);
  expect(node.getSnapshot()).toBeUndefined();
  expect(() => node.setChecked(false)).toThrow("destroyed");
  expect(() => node.subscribe(changed)).toThrow("destroyed");
  expect(() => controller.getNode("later")).toThrow("destroyed");
});

it("owns duplicate subscriptions independently and releases them on controller destruction", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  const controller = new BlockEditorController({ adapter });
  const node = controller.getNode("a");
  const listener = jest.fn();
  const first = node.subscribe(listener);
  const second = node.subscribe(listener);
  expect(adapter.subscriberCount).toBe(2);
  adapter.setNode("a", { checked: true });
  expect(listener).toHaveBeenCalledTimes(2);
  first();
  first();
  expect(adapter.subscriberCount).toBe(1);
  adapter.setNode("a", { checked: false });
  expect(listener).toHaveBeenCalledTimes(3);
  controller.destroy();
  expect(adapter.subscriberCount).toBe(0);
  second();
  controller.destroy();
  adapter.setNode("a", { checked: true });
  expect(listener).toHaveBeenCalledTimes(3);
});

it("attempts every cleanup even when one host disposer fails", () => {
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockEditorController({ adapter });
  const first = controller.getNode("a");
  const second = controller.getNode("b");
  const failure = new Error("release failed");
  const release = jest.fn(() => {
    throw failure;
  });
  adapter.blocks.subscribeBlockNode.mockImplementationOnce(() => release);
  first.subscribe(jest.fn());
  const late = first.subscribe(jest.fn());
  const other = second.subscribe(jest.fn());
  expect(adapter.subscriberCount).toBe(2);
  expect(() => controller.destroy()).toThrow(AggregateError);
  expect(release).toHaveBeenCalledTimes(1);
  expect(adapter.subscriberCount).toBe(0);
  expect(first.getSnapshot()).toBeUndefined();
  expect(second.getSnapshot()).toBeUndefined();
  expect(() => second.setCollapsed(true)).toThrow("destroyed");
  late();
  other();
  expect(() => controller.destroy()).not.toThrow();
});

it("isolates objects and commands between controllers with the same block ID", () => {
  const firstAdapter = new TestBlockEditorAdapter();
  const secondAdapter = new TestBlockEditorAdapter();
  firstAdapter.setNode("shared", { checked: false });
  secondAdapter.setNode("shared", { checked: false });
  const first = new BlockEditorController({ adapter: firstAdapter });
  const second = new BlockEditorController({ adapter: secondAdapter });
  const firstNode = first.getNode("shared");
  const secondNode = second.getNode("shared");
  expect(firstNode).not.toBe(secondNode);
  firstNode.setChecked(true);
  expect(firstNode.checked).toBe(true);
  expect(secondNode.checked).toBe(false);
  expect(secondAdapter.blocks.updateBlockNode).not.toHaveBeenCalled();
  first.destroy();
  secondNode.setCollapsed(true);
  expect(firstNode.getSnapshot()).toBeUndefined();
  expect(secondNode.collapsed).toBe(true);
  second.destroy();
});

it.each<BlockListType>([
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
])(
  "delegates %s without changing renderer type or checkbox state and clears it explicitly",
  (type) => {
    const adapter = new TestBlockEditorAdapter();
    adapter.setNode("a", { type: "markdown", checked: true, color: "red", collapsed: true });
    const controller = new BlockEditorController({ adapter });
    const node = controller.getNode("a");
    const before = node.getSnapshot();
    expect(node.listType).toBeUndefined();
    const changed = jest.fn();
    node.subscribe(changed);
    node.setListType(type);
    expect(node.listType).toBe(type);
    expect(node.getSnapshot()).toMatchObject({
      type: "markdown",
      checked: true,
      color: "red",
      collapsed: true,
      listType: type,
    });
    expect(before?.listType).toBeUndefined();
    node.setChecked(false);
    expect(node.listType).toBe(type);
    node.setListType(null);
    expect(node.listType).toBeUndefined();
    expect(node.checked).toBe(false);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(adapter.blocks.updateBlockNode.mock.calls).toEqual([
      ["a", { listType: type }],
      ["a", { checked: false }],
      ["a", { listType: null }],
    ]);
    controller.destroy();
    expect(() => node.setListType(type)).toThrow("destroyed");
  },
);

it.each([5, 2000])("updates background independently of %i cached nodes", (count) => {
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockEditorController({ adapter });
  const ids = Array.from({ length: count }, (_, index) => `block-${index}`);
  for (const id of ids) {
    adapter.setNode(id);
  }
  adapter.setBlockIds(ids);
  const snapshots = new Map(adapter.nodes);
  const node = controller.getNode(ids[0]!);
  const changed = jest.fn();
  node.subscribe(changed);
  adapter.blocks.getBlockIds.mockClear();
  adapter.blocks.getBlockNode.mockClear();
  node.setColor("red");
  expect(node.color).toBe("red");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(adapter.blocks.getBlockNode.mock.calls.map(([id]) => id)).toEqual([ids[0], ids[0]]);
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
  expect(controller.getNode(ids[0]!)).toBe(node);
  for (const id of ids.slice(1)) {
    expect(adapter.nodes.get(id)).toBe(snapshots.get(id));
  }
  node.setColor(null);
  expect(node.color).toBeUndefined();
  controller.destroy();
});
