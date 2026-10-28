import type { useBlockNode } from "../presentation/hooks/use-block-node";
import type { BlockSlotProps } from "../presentation/slots/types";
import type { BlockEditorApi } from "./block-editor-api";
import { BlockEditorController } from "./block-editor-controller";
import { TestBlockEditorAdapter } from "../test-utils/test-block-editor-adapter";

it("constructs without subscriptions and owns exactly one replaceable attachment", () => {
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockEditorController({ adapter });
  const first = document.createElement("div");
  const second = document.createElement("div");
  expect(controller.adapter).toBe(adapter);
  expect(controller.getRoot()).toBeNull();
  expect(adapter.subscriberCount).toBe(0);
  const detachFirst = controller.attach(first);
  expect(controller.getRoot()).toBe(first);
  expect(() => controller.attach(second)).toThrow("already has an attached root");
  detachFirst();
  const detachSecond = controller.attach(second);
  detachFirst();
  expect(controller.getRoot()).toBe(second);
  detachSecond();
  expect(controller.getRoot()).toBeNull();
  controller.destroy();
  controller.destroy();
  expect(() => controller.attach(first)).toThrow("destroyed");
  expect(adapter.subscriberCount).toBe(0);
});

it("shares manager instances through the narrow component and extension contract", () => {
  const controller = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const api: BlockEditorApi = controller;
  expect(api).toBe(controller);
  expect(api.extensions).toBe(controller.extensions);
  expect(api.events).toBe(controller.events);
  // @ts-expect-error Components and extensions cannot attach event managers.
  expect(api.events.attach).toBe(controller.events.attach);
  // @ts-expect-error Components and extensions cannot destroy resource ownership.
  expect(api.extensions.destroy).toBe(controller.extensions.destroy);
  // @ts-expect-error Only the host controller owns editor destruction.
  expect(api.destroy).toBe(controller.destroy);
  controller.extensions.register("borrowed-api", {
    /**
     * Verifies that setup borrows the controller without a wrapper allocation.
     *
     * @param editor - Narrow editor contract supplied by extension ownership.
     * @returns The controller identity has been checked.
     */
    setup(editor) {
      expect(editor).toBe(controller);
      // @ts-expect-error Setup receives the narrow event subscription API.
      expect(editor.events.attach).toBe(controller.events.attach);
    },
  });
  controller.destroy();
});

it("excludes node teardown from every borrowed node contract", () => {
  const controller: "destroy" extends keyof ReturnType<BlockEditorController["getNode"]>
    ? true
    : false = false;
  const editor: "destroy" extends keyof ReturnType<BlockEditorApi["getNode"]> ? true : false =
    false;
  const hook: "destroy" extends keyof ReturnType<typeof useBlockNode> ? true : false = false;
  const slot: "destroy" extends keyof BlockSlotProps["node"] ? true : false = false;
  expect([controller, editor, hook, slot]).toEqual([false, false, false, false]);
});
