import { BlockEditorController } from "../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { SLOT_POSITIONS, type BlockSlotPosition } from "./types";

it("publishes immutable stable entries in priority order and independently disposes duplicates", () => {
  const registry = new BlockEditorController({ adapter: new TestBlockEditorAdapter() }).slots;
  const Component = () => null;
  const registration = { position: "start" as const, component: Component, priority: 0 };
  const empty = registry.getSnapshot();
  const changed = jest.fn();
  const disposeListener = registry.subscribe(changed);
  const first = registry.register(registration);
  const initial = registry.getSnapshot();
  const entry = initial[0];
  registration.priority = 100;
  expect(entry?.priority).toBe(0);
  expect(registry.getSnapshot()).toBe(initial);
  const second = registry.register({ position: "start", component: Component, priority: 10 });
  const third = registry.register({ position: "end", component: Component, priority: 10 });
  const current = registry.getSnapshot();
  expect(current.map((item) => item.position)).toEqual(["start", "end", "start"]);
  expect(current[2]).toBe(entry);
  expect(new Set(current.map((item) => item.id)).size).toBe(3);
  expect(Object.isFrozen(current)).toBe(true);
  expect(Object.isFrozen(entry)).toBe(true);
  expect(empty).toEqual([]);
  first();
  first();
  expect(changed).toHaveBeenCalledTimes(4);
  expect(registry.getSnapshot().map((item) => item.id)).toEqual(
    current.slice(0, 2).map((item) => item.id),
  );
  disposeListener();
  disposeListener();
  second();
  third();
  expect(changed).toHaveBeenCalledTimes(4);
  expect(registry.getSnapshot()).toEqual([]);
});

it.each<BlockSlotPosition>([...SLOT_POSITIONS, "start", "end", "body"])(
  "accepts the existing %s anchor",
  (position) => {
    const registry = new BlockEditorController({ adapter: new TestBlockEditorAdapter() }).slots;
    registry.register({ position, component: () => null });
    expect(registry.getSnapshot()[0]?.position).toBe(position);
  },
);

it("rejects invalid registrations without publishing or notifying", () => {
  const registry = new BlockEditorController({ adapter: new TestBlockEditorAdapter() }).slots;
  const initial = registry.getSnapshot();
  const changed = jest.fn();
  registry.subscribe(changed);
  expect(() =>
    registry.register({ position: "unsupported" as BlockSlotPosition, component: () => null }),
  ).toThrow("Unsupported");
  expect(() =>
    registry.register({ position: "body", priority: Infinity, component: () => null }),
  ).toThrow("finite");
  expect(() =>
    registry.register({ position: "body", priority: NaN, component: () => null }),
  ).toThrow("finite");
  expect(registry.getSnapshot()).toBe(initial);
  expect(changed).not.toHaveBeenCalled();
});

it("rolls back direct installation after a failing observer and continues delivering notifications", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const stop = editor.slots.subscribe(() => {
    throw new Error("observer failed");
  });
  const healthy = jest.fn();
  editor.slots.subscribe(healthy);
  expect(() => editor.slots.register({ position: "end", component: () => null })).toThrow(
    AggregateError,
  );
  expect(editor.slots.getSnapshot()).toEqual([]);
  expect(healthy).toHaveBeenCalledTimes(2);
  stop();
  editor.slots.register({ position: "end", component: () => null });
  editor.destroy();
});
