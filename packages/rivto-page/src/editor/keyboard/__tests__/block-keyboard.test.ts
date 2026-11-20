import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("captures keymaps per gesture while physical keys remain live and reset on detach", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const detach = attachTestRoot(editor, root);
  editor.keyboard.setKeymapOverride("exact", ["Alt"]);
  const captured = editor.keyboard.capture("exact");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
  expect(editor.keyboard.isHeld(captured)).toBe(true);
  editor.keyboard.setKeymapOverride("exact", ["Shift"]);
  expect(editor.keyboard.isHeld(captured)).toBe(true);
  expect(editor.keyboard.isHeld(editor.keyboard.capture("exact"))).toBe(false);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
  expect(editor.keyboard.isHeld(captured)).toBe(false);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
  detach();
  expect(editor.keyboard.isHeld(captured)).toBe(false);
  editor.destroy();
  root.remove();
});

it("keeps keyboard registrations across remount, honors priority and IME, and rolls back invalid keymaps", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const called: string[] = [];
  editor.keyboard.register({ id: "low", keys: "a", priority: 0 }, () => {
    called.push("low");
  });
  const remove = editor.keyboard.register({ id: "high", keys: "a", priority: 10 }, () => {
    called.push("high");
    return true;
  });
  const detach = attachTestRoot(editor, root);
  const raw = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
  root.dispatchEvent(raw);
  expect(called).toEqual(["high"]);
  expect(raw.defaultPrevented).toBe(true);
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", isComposing: true }));
  expect(called).toEqual(["high"]);
  expect(() => editor.keyboard.replaceKeymap({ high: ["Unknown+a"] })).toThrow();
  expect(editor.keyboard.list().find((entry) => entry.id === "high")?.keys).toEqual(["a"]);
  detach();
  attachTestRoot(editor, root);
  remove();
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  expect(called).toEqual(["high", "low"]);
  editor.destroy();
});

it("routes root actions only to the owning occurrence and resets missed keys on window blur", () => {
  const first = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const second = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.dataset.rivtoBlockEditor = "true";
  inner.dataset.rivtoBlockEditor = "true";
  outer.append(inner);
  document.body.append(outer);
  attachTestRoot(first, outer);
  attachTestRoot(second, inner);
  const host = jest.fn();
  const nested = jest.fn();
  first.keyboard.register({ id: "host", keys: "a" }, host);
  second.keyboard.register({ id: "nested", keys: "a" }, nested);
  inner.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
  expect(host).not.toHaveBeenCalled();
  expect(nested).toHaveBeenCalledTimes(1);
  first.keyboard.setKeymapOverride("held", ["a"]);
  const captured = first.keyboard.capture("held");
  expect(first.keyboard.isHeld(captured)).toBe(true);
  window.dispatchEvent(new Event("blur"));
  expect(first.keyboard.isHeld(captured)).toBe(false);
  first.destroy();
  second.destroy();
  outer.remove();
});

it("delivers keyboard data without native events or elements", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const handler = jest.fn();
  editor.keyboard.register({ id: "action", keys: "a" }, handler);
  attachTestRoot(editor, root);
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  const input = handler.mock.calls[0]![0];
  expect(input.keyboard.key).toBe("a");
  expect(input.targetIsRoot).toBe(true);
  expect(input).not.toHaveProperty("raw");
  expect(input).not.toHaveProperty("root");
  expect(input).not.toHaveProperty("blockElement");
  editor.destroy();
});

it("allows keyboard actions to prevent browser defaults without claiming the shortcut", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  editor.keyboard.register({ id: "action", keys: "a" }, (input) => {
    input.preventDefault();
    return false;
  });
  attachTestRoot(editor, root);
  const event = new KeyboardEvent("keydown", { key: "a", cancelable: true });
  root.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  editor.destroy();
});

it("describes shortcuts using the same primary modifier captured for matching", () => {
  const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const handler = jest.fn();
  try {
    editor.keyboard.register({ id: "primary", keys: "Primary+a" }, handler);
    attachTestRoot(editor, root);
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Win32" });
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", metaKey: true, bubbles: true }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].shortcut).toBe("Primary+a");
  } finally {
    editor.destroy();
    if (platform) {
      Object.defineProperty(navigator, "platform", platform);
    } else {
      Reflect.deleteProperty(navigator, "platform");
    }
  }
});
