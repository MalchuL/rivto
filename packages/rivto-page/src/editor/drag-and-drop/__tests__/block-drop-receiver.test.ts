import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockDropReceiver } from "../block-drop-receiver";
import { DropSurfaceRegistry } from "../drop-surface-registry";

test("releases registration and every listener even when cleanup throws", () => {
  const root = document.createElement("div");
  const unregister = jest.fn(() => {
    throw new Error("registration cleanup");
  });
  const receiver = new BlockDropReceiver(
    new BrowserInputRoot(root),
    { root },
    { register: () => unregister },
  );
  const failed = jest.fn(() => {
    throw new Error("listener cleanup");
  });
  const last = jest.fn();
  receiver.onDetach(failed);
  receiver.onDetach(last);
  expect(() => receiver.destroy()).toThrow(AggregateError);
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
  document.body.append(root);
  const registry = new DropSurfaceRegistry();
  const previous = new BlockDropReceiver(new BrowserInputRoot(root), { root }, registry);
  const identity = { root };
  const current = new BlockDropReceiver(new BrowserInputRoot(root), identity, registry);
  previous.destroy();
  expect(registry.getCurrent(identity)).toBe(identity);
  current.destroy();
  expect(registry.getCurrent(identity)).toBeUndefined();
});
