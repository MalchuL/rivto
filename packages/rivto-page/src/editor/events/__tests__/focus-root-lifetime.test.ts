import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("stops focus notifications when the borrowed occurrence Root detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  const child = document.createElement("input");
  element.append(child);
  const root = new BrowserInputRoot(element);
  const focus = jest.fn();
  const blur = jest.fn();
  editor.events.on("focus", focus);
  editor.events.on("blur", blur);
  const detach = editor.attach(root);
  try {
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
    root.detach();
    child.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    editor.events.notifyInitialFocus(root);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
  }
});

it("stops the current focus notification when an observer detaches the Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  const root = new BrowserInputRoot(element);
  const later = jest.fn();
  editor.events.on("focus", () => root.detach());
  editor.events.on("focus", later);
  const detach = editor.attach(root);
  try {
    element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(later).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
  }
});

it("does not reconcile initial focus after the borrowed Root detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  const child = document.createElement("input");
  element.append(child);
  document.body.append(element);
  child.focus();
  const root = new BrowserInputRoot(element);
  const focus = jest.fn();
  editor.events.on("focus", focus);
  const detach = editor.attach(root);
  try {
    expect(focus).toHaveBeenCalledTimes(1);
    root.detach();
    editor.events.notifyInitialFocus(root);
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    editor.destroy();
    element.remove();
  }
});

it("retains a replacement focus attachment after stale cleanup", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  const first = new BrowserInputRoot(element);
  const focus = jest.fn();
  editor.events.on("focus", focus);
  const detachFirst = editor.attach(first);
  first.detach();
  detachFirst();
  const second = new BrowserInputRoot(element);
  const detachSecond = editor.attach(second);
  try {
    detachFirst();
    element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    detachSecond();
    second.detach();
    editor.destroy();
  }
});
