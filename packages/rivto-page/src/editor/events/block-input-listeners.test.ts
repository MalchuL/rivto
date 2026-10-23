import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";

it("orders input handlers, claims without preventing defaults, and preserves remount registrations", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const order: number[] = [];
  editor.events.register("low", { type: "click", priority: 0 }, () => {
    order.push(0);
    return "continue";
  });
  editor.events.register("first", { type: "click", priority: 10 }, () => {
    order.push(1);
    return "continue";
  });
  editor.events.register("claim", { type: "click", priority: 10 }, () => {
    order.push(2);
    return "handled";
  });
  const add = jest.spyOn(root, "addEventListener");
  const detach = editor.attach(root);
  expect(add.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
  const raw = new MouseEvent("click", { bubbles: true, cancelable: true });
  root.dispatchEvent(raw);
  expect(order).toEqual([1, 2]);
  expect(raw.defaultPrevented).toBe(false);
  detach();
  root.click();
  expect(order).toEqual([1, 2]);
  editor.attach(root);
  root.click();
  expect(order).toEqual([1, 2, 1, 2]);
  editor.destroy();
});

it("excludes nested editors from scoped context and releases extension handlers", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="outer"><span data-block-content>Text</span></div><div data-rivto-block-editor><div data-block-id="inner">Nested</div></div>';
  const handler = jest.fn();
  const remove = editor.extensions.register("input", {
    /**
     * Installs fixture input behavior under the tested extension scope.
     *
     * @param api - Borrowed editor APIs.
     * @returns Fixture resources have been captured for cleanup.
     */
    setup(api) {
      api.events.register("click", { type: "click", priority: 0, scope: "block" }, handler);
    },
  });
  editor.attach(root);
  root.querySelector<HTMLElement>("[data-block-content]")!.click();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler.mock.calls[0]![0].blockId).toBe("outer");
  root.querySelector<HTMLElement>('[data-block-id="inner"]')!.click();
  expect(handler).toHaveBeenCalledTimes(1);
  remove();
  root.querySelector<HTMLElement>("[data-block-content]")!.click();
  expect(handler).toHaveBeenCalledTimes(1);
  editor.destroy();
});

it("rolls back failed setup and validates IDs and priorities", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const handler = jest.fn();
  expect(() =>
    editor.extensions.register("failed", {
      /**
       * Installs fixture input behavior under the tested extension scope.
       *
       * @param api - Borrowed editor APIs.
       * @returns Fixture resources have been captured for cleanup.
       */
      setup(api) {
        api.events.register("input", { type: "keydown", priority: 0 }, handler);
        throw new Error("failed");
      },
    }),
  ).toThrow("failed");
  const remove = editor.events.register("input", { type: "keydown", priority: 0 }, handler);
  expect(() =>
    editor.events.register("input", { type: "keydown", priority: 0 }, handler),
  ).toThrow();
  expect(() =>
    editor.events.register("nan", { type: "keydown", priority: NaN }, handler),
  ).toThrow();
  remove();
  editor.destroy();
});

it("attempts every detach observer and still releases listeners when one fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const handler = jest.fn();
  editor.events.register("click", { type: "click", priority: 0 }, handler);
  editor.events.onDetach(() => {
    throw new Error("detach failure");
  });
  const healthy = jest.fn();
  editor.events.onDetach(healthy);
  const detach = editor.attach(root);
  expect(detach).toThrow(AggregateError);
  expect(healthy).toHaveBeenCalledTimes(1);
  expect(editor.getRoot()).toBeNull();
  root.click();
  expect(handler).not.toHaveBeenCalled();
  editor.destroy();
});

it("does not deliver removed handlers or newly registered handlers in the current dispatch", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const removed = jest.fn();
  const added = jest.fn();
  const release = editor.events.register("removed", { type: "click", priority: 0 }, removed);
  let installed = false;
  editor.events.register("first", { type: "click", priority: 10 }, () => {
    release();
    if (!installed) {
      installed = true;
      editor.events.register("added", { type: "click", priority: 0 }, added);
    }
    return "continue";
  });
  editor.attach(root);
  root.click();
  expect(removed).not.toHaveBeenCalled();
  expect(added).not.toHaveBeenCalled();
  root.click();
  expect(added).toHaveBeenCalledTimes(1);
  editor.destroy();
});

it("delivers observers despite claims and keeps DOM phases ahead of queue priority", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const order: string[] = [];
  editor.events.register("capture", { type: "click", capture: true, priority: -100 }, () => {
    order.push("capture");
    return "continue";
  });
  editor.events.register("claim", { type: "click", priority: 100 }, () => {
    order.push("claim");
    return "handled";
  });
  editor.events.observe("observe", { type: "click", priority: -100 }, () => {
    order.push("observe");
    return "handled";
  });
  editor.events.observe("window", { type: "click", target: "window", priority: 0 }, () => {
    order.push("window");
  });
  const native = jest.fn();
  window.addEventListener("click", native);
  editor.attach(root);
  root.click();
  expect(order).toEqual(["capture", "observe", "claim", "window"]);
  expect(native).toHaveBeenCalledTimes(1);
  editor.destroy();
  window.removeEventListener("click", native);
  root.remove();
});

it("defers registrations added in capture until the next native event", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const added = jest.fn(() => "continue" as const);
  let installed = false;
  editor.events.register("capture", { type: "click", capture: true, priority: 0 }, () => {
    if (!installed) {
      installed = true;
      editor.events.register("added", { type: "click", priority: 0 }, added);
    }
    return "continue";
  });
  editor.attach(root);
  root.click();
  expect(added).not.toHaveBeenCalled();
  root.click();
  expect(added).toHaveBeenCalledTimes(1);
  editor.destroy();
});

it("does not deliver unscoped root handlers for nested occurrences", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = "<div data-rivto-block-editor><button>Nested</button></div>";
  const handler = jest.fn();
  editor.events.register("click", { type: "click", priority: 0 }, handler);
  editor.attach(root);
  root.querySelector("button")!.click();
  expect(handler).not.toHaveBeenCalled();
  editor.destroy();
});

it("rolls back input listeners when focus listener installation fails and permits retry", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const handler = jest.fn();
  editor.events.register("click", { type: "click", priority: 0 }, handler);
  const original = root.addEventListener.bind(root);
  const add = jest.spyOn(root, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "focusout") {
      throw new Error("installation failure");
    }
    original(type, listener, options);
  });
  expect(() => editor.attach(root)).toThrow("installation failure");
  expect(editor.getRoot()).toBeNull();
  root.click();
  expect(handler).not.toHaveBeenCalled();
  add.mockRestore();
  const stale = editor.attach(root);
  stale();
  editor.attach(root);
  stale();
  root.click();
  expect(handler).toHaveBeenCalledTimes(1);
  editor.destroy();
});

it("releases other native listeners after a removal fails and reports all errors", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const handler = jest.fn();
  editor.events.register("click", { type: "click", priority: 0 }, handler);
  editor.events.register("input", { type: "input", priority: 0 }, handler);
  const detach = editor.attach(root);
  const original = root.removeEventListener.bind(root);
  const remove = jest
    .spyOn(root, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      original(type, listener, options);
      if (type === "click" || type === "focusin") {
        throw new Error(type);
      }
    });
  expect(detach).toThrow(AggregateError);
  expect(remove.mock.calls.map(([type]) => type)).toEqual(
    expect.arrayContaining(["click", "input", "focusin", "focusout"]),
  );
  root.click();
  root.dispatchEvent(new Event("input"));
  expect(handler).not.toHaveBeenCalled();
  remove.mockRestore();
  editor.destroy();
});

it("stops handler delivery on error without hiding the original failure", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const add = jest.spyOn(root, "addEventListener");
  const failure = new Error("handler failure");
  editor.events.register("fail", { type: "click", priority: 10 }, () => {
    throw failure;
  });
  const later = jest.fn();
  editor.events.register("later", { type: "click", priority: 0 }, later);
  editor.attach(root);
  const raw = new MouseEvent("click");
  Object.defineProperty(raw, "target", { value: root });
  const listener = add.mock.calls.find(([type]) => type === "click")![1] as EventListener;
  expect(() => listener(raw)).toThrow(failure);
  expect(later).not.toHaveBeenCalled();
  editor.destroy();
});
