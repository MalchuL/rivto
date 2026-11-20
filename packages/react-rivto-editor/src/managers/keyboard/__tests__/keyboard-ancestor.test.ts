/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { KeyboardEditorEvent } from "../keyboard-editor-event";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { captureKeyboardInput } from "@chulane/rivto-root";
import { captureTestKeyboardTarget } from "../test-utils/keyboard-test-target";

it("resolves text-target ancestry without exposing a native target", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.id = "properties-test";
  const text = document.createTextNode("value");
  root.append(text);
  const raw = new KeyboardEvent("keydown", { key: "Escape" });
  Object.defineProperty(raw, "target", { value: text });
  try {
    const event = new KeyboardEditorEvent({
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
      shortcut: "Escape",
      phase: "keydown",
    });
    expect(event.targetHasAncestor("#properties-test")).toBe(true);
    expect(event).not.toHaveProperty("raw");
    root.removeAttribute("id");
    expect(event.targetHasAncestor("#properties-test")).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
