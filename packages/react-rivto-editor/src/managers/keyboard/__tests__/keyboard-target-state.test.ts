/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { KeyboardEditorEvent } from "../keyboard-editor-event";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { captureKeyboardInput } from "@chulane/rivto-root";
import { captureTestKeyboardTarget } from "../test-utils/keyboard-test-target";

it("reads live target properties without exposing the element", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const control = document.createElement("div");
  const button = document.createElement("button");
  control.dataset.editorControl = "";
  control.append(button);
  root.append(control);
  const frame = document.createElement("iframe");
  document.body.append(root, frame);
  const raw = new KeyboardEvent("keydown", { key: "ArrowRight" });
  Object.defineProperty(raw, "target", { configurable: true, value: button });
  /**
   * Captures the current fixture target as a new keyboard delivery.
   *
   * @returns Editor event with the target and panel context for this delivery.
   */
  const createEvent = () =>
    new KeyboardEditorEvent({
      keyboardInput: captureKeyboardInput(raw),
      keyboardTarget: captureTestKeyboardTarget(root, raw),
      reactPanel: panel,
      inputRoot: new BrowserInputRoot(root),
      inputRegistration: { isCurrent: () => true },
      mode: "edgeless",
      selection: undefined,
      eventTarget: "surface",
      insideRoot: true,
      insideBlock: false,
      blockId: undefined,
      insideContent: false,
      shortcut: "ArrowRight",
      phase: "keydown",
    });
  const event = createEvent();
  try {
    expect(event.readTarget()?.isCurrentRealmHTMLElement).toBe(true);
    expect(event.readTarget()?.isFormControl).toBe(true);
    expect(event.targetHasAncestor("[data-editor-control]")).toBe(true);
    control.removeAttribute("data-editor-control");
    expect(event.targetHasAncestor("[data-editor-control]")).toBe(false);
    Object.defineProperty(button, "isContentEditable", { value: true });
    expect(event.readTarget()?.isEditable).toBe(true);
    const foreign = frame.contentDocument!.createElement("a");
    Object.defineProperty(raw, "target", { configurable: true, value: foreign });
    const foreignEvent = createEvent();
    expect(foreignEvent.readTarget()?.isCurrentRealmHTMLElement).toBe(false);
    expect(foreignEvent.readTarget()?.isLink).toBe(true);
    Object.defineProperty(raw, "target", {
      configurable: true,
      value: document.createTextNode(""),
    });
    expect(createEvent().readTarget()).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    frame.remove();
  }
});
