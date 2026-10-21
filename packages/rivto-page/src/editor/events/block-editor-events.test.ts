import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";

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
  const detach = editor.attach(root);
  first.focus();
  second.focus();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(blur).not.toHaveBeenCalled();
  second.blur();
  expect(blur).toHaveBeenCalledTimes(1);
  detach();
  first.focus();
  expect(focus).toHaveBeenCalledTimes(1);
  const detachAgain = editor.attach(root);
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
  const detach = editor.attach(root);
  editor.destroy();
  detach();
  expect(remove).toHaveBeenCalledTimes(2);
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
  const detach = editor.attach(root);
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
    expect(editor.getRoot()).toBe(root);
    throw new Error("initial observer failed");
  });
  expect(() => editor.attach(root)).toThrow(AggregateError);
  expect(editor.getRoot()).toBeNull();
  expect(remove).toHaveBeenCalledTimes(2);
  release();
  const healthy = jest.fn();
  editor.events.on("focus", healthy);
  const detach = editor.attach(root);
  expect(healthy).toHaveBeenCalledTimes(1);
  expect(healthy.mock.calls[0]![0].isTrusted).toBe(false);
  detach();
  editor.destroy();
  root.remove();
});
