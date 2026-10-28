import { BlockDropReceiver } from "./block-drop-receiver";
import { DropSurfaceRegistry } from "./drop-surface-registry";

test("releases feedback and every listener even when cleanup throws", () => {
  const root = document.createElement("div");
  const unregister = jest.fn(() => {
    throw new Error("registration cleanup");
  });
  const receiver = new BlockDropReceiver({ root }, { register: () => unregister });
  receiver.update({ element: root, destination: { kind: "inside", parentId: null } });
  const failed = jest.fn(() => {
    throw new Error("listener cleanup");
  });
  const last = jest.fn();
  receiver.onDetach(failed);
  receiver.onDetach(last);
  expect(() => receiver.destroy()).toThrow(AggregateError);
  expect(root.hasAttribute("data-block-drop-active")).toBe(false);
  expect(last).toHaveBeenCalledTimes(1);
  expect(receiver.active).toBe(false);
  receiver.destroy();
  expect(unregister).toHaveBeenCalledTimes(1);
  const late = jest.fn();
  receiver.onDetach(late);
  expect(late).toHaveBeenCalledTimes(1);
});

test("old receiver destruction preserves the replacement registration", () => {
  const root = document.createElement("div");
  const registry = new DropSurfaceRegistry();
  const previous = new BlockDropReceiver({ root }, registry);
  const identity = { root };
  const current = new BlockDropReceiver(identity, registry);
  previous.destroy();
  expect(registry.get(root)).toBe(identity);
  current.destroy();
  expect(registry.get(root)).toBeUndefined();
});
