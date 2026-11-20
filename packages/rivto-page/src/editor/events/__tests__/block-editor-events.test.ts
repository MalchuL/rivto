import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("observes boundary focus changes, ignores internal moves, and stops delivery after detach", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const first = document.createElement("input");
  const second = document.createElement("input");
  root.append(first, second);
  document.body.append(root);
  const focus = jest.fn();
  const blur = jest.fn();
  const stop = editor.events.on("focus", focus);
  editor.events.on("blur", blur);
  const detach = attachTestRoot(editor, root);
  first.focus();
  second.focus();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith();
  expect(blur).not.toHaveBeenCalled();
  second.blur();
  expect(blur).toHaveBeenCalledTimes(1);
  detach();
  first.focus();
  expect(focus).toHaveBeenCalledTimes(1);
  const detachAgain = attachTestRoot(editor, root);
  expect(focus).toHaveBeenCalledTimes(2);
  second.blur();
  root.dispatchEvent(new FocusEvent("focusin"));
  expect(focus).toHaveBeenCalledTimes(3);
  stop();
  stop();
  root.dispatchEvent(new FocusEvent("focusin"));
  expect(focus).toHaveBeenCalledTimes(3);
  detachAgain();
  editor.destroy();
  root.remove();
});

it("removes native listeners and event subscriptions on final destruction", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const remove = jest.spyOn(root, "removeEventListener");
  const focus = jest.fn();
  editor.events.on("focus", focus);
  const detach = attachTestRoot(editor, root);
  editor.destroy();
  detach();
  expect(
    remove.mock.calls.filter(([type]) => type === "focusin" || type === "focusout"),
  ).toHaveLength(2);
  root.dispatchEvent(new FocusEvent("focusin"));
  expect(focus).not.toHaveBeenCalled();
});

it("attempts neighboring focus observers even when an earlier observer fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const add = jest.spyOn(root, "addEventListener");
  editor.events.on("focus", () => {
    throw new Error("observer failed");
  });
  const healthy = jest.fn();
  editor.events.on("focus", healthy);
  const detach = attachTestRoot(editor, root);
  const listener = add.mock.calls.find(([name]) => name === "focusin")![1] as (
    event: FocusEvent,
  ) => void;
  expect(() => listener(new FocusEvent("focusin"))).toThrow(AggregateError);
  expect(healthy).toHaveBeenCalledTimes(1);
  detach();
  editor.destroy();
});

it("rolls back attachment and native listeners when initial focus observation fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const input = document.createElement("input");
  root.append(input);
  document.body.append(root);
  input.focus();
  const remove = jest.spyOn(root, "removeEventListener");
  const release = editor.events.on("focus", () => {
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    throw new Error("initial observer failed");
  });
  expect(() => attachTestRoot(editor, root)).toThrow(AggregateError);
  expect(editor.inputRoot).toBeUndefined();
  expect(
    remove.mock.calls.filter(([type]) => type === "focusin" || type === "focusout"),
  ).toHaveLength(2);
  release();
  const healthy = jest.fn();
  editor.events.on("focus", healthy);
  const detach = attachTestRoot(editor, root);
  expect(healthy).toHaveBeenCalledTimes(1);
  expect(healthy).toHaveBeenCalledWith();
  detach();
  editor.destroy();
  root.remove();
});

it("isolates nested occurrence focus and reconciles only its own autofocus", () => {
  const outer = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const inner = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = "<input><div data-rivto-block-editor><input></div>";
  document.body.append(root);
  const nested = root.querySelector<HTMLElement>("div")!;
  nested.querySelector("input")!.focus();
  const outerFocus = jest.fn();
  const innerFocus = jest.fn();
  const outerBlur = jest.fn();
  outer.events.on("focus", outerFocus);
  outer.events.on("blur", outerBlur);
  inner.events.on("focus", innerFocus);
  attachTestRoot(outer, root);
  attachTestRoot(inner, nested);
  expect(outerFocus).not.toHaveBeenCalled();
  expect(innerFocus).toHaveBeenCalledTimes(1);
  root.querySelector("input")!.focus();
  expect(outerFocus).toHaveBeenCalledTimes(1);
  nested.querySelector("input")!.focus();
  expect(outerFocus).toHaveBeenCalledTimes(1);
  expect(outerBlur).toHaveBeenCalledTimes(1);
  inner.destroy();
  outer.destroy();
  root.remove();
});
