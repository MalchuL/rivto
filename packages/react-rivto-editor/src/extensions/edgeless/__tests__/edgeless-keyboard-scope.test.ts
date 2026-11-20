/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { canRunEdgelessKeyboardAction } from "../edgeless-keyboard-scope";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("blocks shortcuts during a transform or after the input registration is replaced", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(true);
    root.dataset.transforming = "move";
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(false);
    delete root.dataset.transforming;
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(true);
    panel.setRoot(null);
    panel.setRoot(root);
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(false);
    expect(canRunEdgelessKeyboardAction(panel, panel.inputRoot!)).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("checks the live transform marker without a panel DOM-root accessor", () => {
  const element = document.createElement("div");
  const inputRoot = new BrowserInputRoot(element);
  const panel = { inputRoot };
  try {
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(true);
    element.dataset.transforming = "move";
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(false);
    element.dataset.transforming = "";
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(true);
    inputRoot.detach();
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(false);
  } finally {
    inputRoot.detach();
  }
});

it("rejects a registration replaced during the marker read", () => {
  const element = document.createElement("div");
  const original = new BrowserInputRoot(element);
  const replacement = new BrowserInputRoot(element);
  const panel = { inputRoot: original };
  /**
   * Replaces the registration while the guard reads its marker.
   *
   * @returns No attribute value after the original registration is detached.
   */
  original.readAttribute = () => {
    original.detach();
    panel.inputRoot = replacement;
    return undefined;
  };
  try {
    expect(canRunEdgelessKeyboardAction(panel, original)).toBe(false);
  } finally {
    original.detach();
    replacement.detach();
  }
});
