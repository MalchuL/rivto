import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("borrows a matching mounted root without taking ownership of it", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const inactive = new BrowserInputRoot(document.createElement("div"));
  inactive.detach();
  const root = new BrowserInputRoot(element);
  const observed = jest.fn();
  editor.events.observe("borrowed-input", { type: "click", priority: 0 }, observed);
  try {
    expect(() => editor.attach(inactive)).toThrow("Input root is not attached");
    const detach = editor.attach(root);
    element.click();
    expect(observed).toHaveBeenCalledTimes(1);
    detach();
    expect(root.isAttached()).toBe(true);
    const detachAgain = editor.attach(root);
    root.detach();
    element.click();
    expect(observed).toHaveBeenCalledTimes(1);
    detachAgain();
    expect(() => editor.attach(root)).toThrow("Input root is not attached");
  } finally {
    root.detach();
    editor.destroy();
  }
});
