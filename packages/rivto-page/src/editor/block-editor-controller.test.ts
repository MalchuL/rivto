import { BlockEditorController } from "./block-editor-controller";
import { TestBlockEditorAdapter } from "../test-utils/test-block-editor-adapter";

it("constructs without subscriptions and owns exactly one replaceable attachment", () => {
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockEditorController(adapter);
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
