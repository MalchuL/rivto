import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("reconciles initial focus only for the exact current occurrence", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const input = document.createElement("input");
  element.dataset.rivtoBlockEditor = "true";
  element.append(input);
  document.body.append(element);
  const previous = new BrowserInputRoot(element);
  const current = new BrowserInputRoot(element);
  const focus = jest.fn();
  editor.events.on("focus", focus);
  const detachPrevious = editor.attach(previous);
  detachPrevious();
  input.focus();
  const detachCurrent = editor.attach(current);
  try {
    expect(focus).toHaveBeenCalledTimes(1);
    expect(previous.isAttached()).toBe(true);
    editor.events.notifyInitialFocus(previous);
    expect(focus).toHaveBeenCalledTimes(1);
    editor.events.notifyInitialFocus(current);
    expect(focus).toHaveBeenCalledTimes(2);
  } finally {
    detachCurrent();
    previous.detach();
    current.detach();
    editor.destroy();
    element.remove();
  }
});
