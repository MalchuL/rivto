import { BlockEditorController } from "../../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import type { BlockWrapperProps } from "./types";

it("retains immutable registration order and isolates duplicate components and subscribers", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const wrappers = editor.wrappers;
  const changed = jest.fn();
  const stopFirst = wrappers.subscribe(changed);
  const stopSecond = wrappers.subscribe(changed);
  const Component = ({ children }: BlockWrapperProps) => children;
  const empty = wrappers.getSnapshot();
  expect(wrappers.getSnapshot()).toBe(empty);
  const first = wrappers.register({ component: Component, priority: 10 });
  const snapshot = wrappers.getSnapshot();
  const second = wrappers.register({ component: Component, priority: 10 });
  expect(snapshot).toHaveLength(1);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot[0])).toBe(true);
  const entries = wrappers.getSnapshot();
  expect(entries.map((entry) => entry.component)).toEqual([Component, Component]);
  expect(entries[0].id).not.toBe(entries[1].id);
  expect(changed).toHaveBeenCalledTimes(4);
  stopFirst();
  first();
  first();
  expect(wrappers.getSnapshot()).toEqual([entries[1]]);
  expect(changed).toHaveBeenCalledTimes(5);
  stopSecond();
  second();
  expect(wrappers.getSnapshot()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(5);
  editor.destroy();
  expect(() => wrappers.register({ component: Component, priority: 10 })).toThrow("destroyed");
  expect(() => wrappers.subscribe(changed)).toThrow("destroyed");
});

it("rolls back observer failure after attempting every subscriber", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const stop = editor.wrappers.subscribe(() => {
    throw new Error("observer failed");
  });
  const healthy = jest.fn();
  editor.wrappers.subscribe(healthy);
  expect(() =>
    editor.wrappers.register({ component: ({ children }) => children, priority: 0 }),
  ).toThrow(AggregateError);
  expect(editor.wrappers.getSnapshot()).toEqual([]);
  expect(healthy).toHaveBeenCalledTimes(2);
  stop();
  editor.destroy();
});

it("captures wrapper resources in extension setup, rollback, removal, and destruction", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const Component = ({ children }: BlockWrapperProps) => children;
  const retained = editor.wrappers.register({ component: Component, priority: 10 });
  expect(() =>
    editor.extensions.register("failed-wrapper", {
      /**
       * Installs a captured decorator before failing the setup transaction.
       *
       * @param api - Borrowed editor whose resource owner rolls back this registration.
       * @returns Setup never completes successfully.
       * @throws Always throws the fixture setup failure.
       */
      setup(api) {
        api.wrappers.register({ component: Component, priority: 10 });
        throw new Error("setup failed");
      },
    }),
  ).toThrow(AggregateError);
  expect(editor.wrappers.getSnapshot()).toHaveLength(1);
  const cleanup = jest.fn(() => expect(editor.wrappers.getSnapshot()).toHaveLength(2));
  const remove = editor.extensions.register("wrapper", {
    /**
     * Installs a captured decorator and a cleanup observing it before removal.
     *
     * @param api - Borrowed editor owning the registration until feature removal.
     * @returns Cleanup executed before captured registrations are released.
     */
    setup(api) {
      api.wrappers.register({ component: Component, priority: 10 });
      return cleanup;
    },
  });
  remove();
  remove();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(editor.wrappers.getSnapshot()).toHaveLength(1);
  editor.destroy();
  expect(editor.wrappers.getSnapshot()).toEqual([]);
  retained();
});

it("sorts by descending priority, retains tie order, and captures caller fields", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const Component = ({ children }: BlockWrapperProps) => children;
  const registration = { component: Component, priority: 5 };
  const first = editor.wrappers.register(registration);
  registration.priority = 1000;
  editor.wrappers.register({ component: Component, priority: -5 });
  editor.wrappers.register({ component: Component, priority: 20 });
  editor.wrappers.register({ component: Component, priority: 5 });
  const entries = editor.wrappers.getSnapshot();
  expect(entries.map((entry) => entry.priority)).toEqual([20, 5, 5, -5]);
  expect(entries.map((entry) => entry.id)).toEqual([2, 0, 3, 1]);
  first();
  expect(editor.wrappers.getSnapshot().map((entry) => entry.id)).toEqual([2, 3, 1]);
  editor.destroy();
});

it("rejects missing or nonfinite priorities before changing the snapshot or notifying", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const changed = jest.fn();
  editor.wrappers.subscribe(changed);
  const snapshot = editor.wrappers.getSnapshot();
  const Component = ({ children }: BlockWrapperProps) => children;
  for (const priority of [NaN, Infinity, -Infinity]) {
    expect(() => editor.wrappers.register({ component: Component, priority })).toThrow("finite");
  }
  // @ts-expect-error A wrapper registration requires an explicit priority.
  expect(() => editor.wrappers.register({ component: Component })).toThrow("finite");
  expect(editor.wrappers.getSnapshot()).toBe(snapshot);
  expect(changed).not.toHaveBeenCalled();
  editor.wrappers.register({ component: Component, priority: 0 });
  expect(editor.wrappers.getSnapshot()[0].id).toBe(0);
  editor.destroy();
});
