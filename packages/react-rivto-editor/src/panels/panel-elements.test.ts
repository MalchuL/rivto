const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { createTestCoreEditor } from "../test-utils";
import { PanelElements } from "@chulane/rivto";

it("restricts commands to a selected root and observes descendants entering or leaving it", async () => {
  const editor = await createTestCoreEditor();
  const shape = { type: "shape", frame: { x: 0, y: 0, width: 20, height: 30 }, zIndex: 0 };
  const root = editor.elements.insertElement({ ...shape, type: "group" });
  const other = editor.elements.insertElement({ ...shape, type: "group", children: [
    { ...shape, id: "nested", children: [{ ...shape, id: "leaf" }] },
  ] });
  const elements = new PanelElements(editor.elements, editor.getDocument(), root.id);
  expect(elements.getElementNode(root.id)).toBeUndefined();
  const nodeChanged = jest.fn(); const treeChanged = jest.fn();
  elements.subscribeElementNode("leaf", nodeChanged);
  elements.subscribeElement("leaf", treeChanged);
  editor.elements.moveElements(["nested"], { parentId: root.id });
  expect(elements.getElementNodes().map(({ id }) => id)).toEqual(["nested", "leaf"]);
  expect(nodeChanged).toHaveBeenCalledTimes(1);
  expect(treeChanged).toHaveBeenCalledTimes(1);
  const before = editor.getDocument().getSnapshot();
  expect(() => elements.removeElements(["leaf", other.id])).toThrow("outside root");
  expect(() => elements.moveElements(["leaf"], { parentId: other.id })).toThrow("outside root");
  expect(() => elements.insertElement({ ...shape, childIds: [other.id] })).toThrow("outside root");
  expect(editor.getDocument().getSnapshot()).toEqual(before);
  editor.elements.moveElements(["nested"], { parentId: other.id });
  expect(elements.getElementNodes()).toEqual([]);
  expect(nodeChanged).toHaveBeenCalledTimes(2);
  expect(treeChanged).toHaveBeenCalledTimes(2);
  await editor.destroy();
});

it.each([10, 2000])("notifies only the changed node among %i scoped subscriptions", async (count) => {
  const editor = await createTestCoreEditor();
  const root = editor.elements.insertElement({ type: "group", zIndex: 0, children:
    Array.from({ length: count }, (_, i) => ({ id: `node-${i}`, type: "shape", zIndex: 0, frame: { x: i, y: 0, width: 1, height: 1 } })) });
  const scoped = new PanelElements(editor.elements, editor.getDocument(), root.id);
  const listeners = Array.from({ length: count }, () => jest.fn());
  const dispose = listeners.map((listener, i) => scoped.subscribeElementNode(`node-${i}`, listener));
  const lookup = jest.spyOn(editor.elements, "getElementNode");
  scoped.updateElement("node-0", { frame: { x: 42 } });
  expect(scoped.getElementNode("node-0")!.frame.x).toBe(42);
  expect(listeners[0]).toHaveBeenCalledTimes(1);
  expect(listeners.slice(1).every((listener) => listener.mock.calls.length === 0)).toBe(true);
  expect(lookup.mock.calls.length).toBeLessThan(8);
  lookup.mockRestore(); dispose.forEach((unsubscribe) => unsubscribe()); await editor.destroy();
});
