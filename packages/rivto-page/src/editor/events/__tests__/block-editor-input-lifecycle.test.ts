import { BlockEditorEvents } from "../block-editor-events";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("retains registration ownership and native rollback failures and permits retry", () => {
  const setupFailure = new Error("ownership failed");
  const cleanupFailure = new Error("native removal failed");
  const owner = {
    /**
     * Keeps the fixture owner active during registration.
     *
     * @returns Registration is allowed.
     */
    assertActive() {},
    registerCleanup: jest.fn((release: () => void) => release),
  };
  const dispatcher = new BlockEditorEvents(owner);
  const root = document.createElement("div");
  const inputRoot = new BrowserInputRoot(root);
  const detach = dispatcher.attach(inputRoot);
  owner.registerCleanup.mockImplementationOnce(() => {
    throw setupFailure;
  });
  const remove = jest.spyOn(root, "removeEventListener").mockImplementationOnce(() => {
    throw cleanupFailure;
  });
  const stale = jest.fn(() => "continue" as const);
  let failure: unknown;
  try {
    dispatcher.register("retry", { type: "click", priority: 0 }, stale);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([setupFailure, cleanupFailure]);
  remove.mockRestore();
  const replacement = jest.fn(() => "continue" as const);
  dispatcher.register("retry", { type: "click", priority: 0 }, replacement);
  root.click();
  expect(stale).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledTimes(1);
  detach();
  const detachReplacement = dispatcher.attach(inputRoot);
  detach();
  root.click();
  expect(replacement).toHaveBeenCalledTimes(2);
  detachReplacement();
  inputRoot.detach();
});

it("rolls back pointer listeners when normalized input attachment fails", () => {
  const owner = {
    /**
     * Keeps the fixture owner active while listeners are registered.
     *
     * @returns Registration is allowed.
     */
    assertActive() {},
    registerCleanup: (release: () => void) => release,
  };
  const dispatcher = new BlockEditorEvents(owner);
  const root = document.createElement("div");
  const inputRoot = new BrowserInputRoot(root);
  const pointer = jest.fn(() => "continue" as const);
  dispatcher.register("pointer", { type: "pointerdown", priority: 0 }, pointer);
  dispatcher.register("click", { type: "click", priority: 0 }, () => "continue");
  const original = root.addEventListener.bind(root);
  const add = jest.spyOn(root, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "click") {
      throw new Error("click setup failed");
    }
    original(type, listener, options);
  });
  expect(() => dispatcher.attach(inputRoot)).toThrow("click setup failed");
  root.dispatchEvent(new Event("pointerdown"));
  expect(pointer).not.toHaveBeenCalled();
  add.mockRestore();
  const detach = dispatcher.attach(inputRoot);
  root.dispatchEvent(new Event("pointerdown"));
  expect(pointer).toHaveBeenCalledTimes(1);
  detach();
  inputRoot.detach();
});
