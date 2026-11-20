/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ChildrenPanel } from "@chulane/rivto";
import { createReactEditor } from "../../editor/react-editor";
import { ReactPanel } from "../react-panel";

it("exposes the routing lifetime while the occurrence accepts input", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  document.body.append(element);
  try {
    panel.setRoot(element);
    const original = panel.inputRegistration;
    expect(original?.isCurrent(panel.inputRoot)).toBe(true);
    panel.setEnabled(false);
    expect(panel.inputRegistration).toBeUndefined();
    expect(original?.isCurrent()).toBe(false);
    panel.setEnabled(true);
    expect(panel.inputRegistration).not.toBe(original);
    expect(panel.inputRegistration?.isCurrent(panel.inputRoot)).toBe(true);
    expect(original?.isCurrent()).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("publishes the staged registration before routing listeners observe it", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const panel = new ReactPanel(editor, new ChildrenPanel(core, {}));
  const element = document.createElement("div");
  document.body.append(element);
  const observed: boolean[] = [];
  const unsubscribe = editor.panels.subscribeRoots(() => {
    if (panel.inputRoot) {
      observed.push(panel.inputRegistration?.isCurrent(panel.inputRoot) ?? false);
    }
  });
  try {
    panel.setRoot(element);
    expect(observed).toEqual([true]);
  } finally {
    unsubscribe();
    panel.destroy();
    editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("clears a staged registration when routing setup fails", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const panel = new ReactPanel(editor, new ChildrenPanel(core, {}));
  const element = document.createElement("div");
  document.body.append(element);
  const failure = new Error("routing listener failed");
  let fail = true;
  const unsubscribe = editor.panels.subscribeRoots(() => {
    if (fail) {
      fail = false;
      throw failure;
    }
  });
  try {
    expect(() => panel.setRoot(element)).toThrow(failure);
    expect(panel.inputRoot).toBeUndefined();
    expect(panel.inputRegistration).toBeUndefined();
    expect(panel.mountedRoot).toBeUndefined();
  } finally {
    unsubscribe();
    panel.destroy();
    editor.destroy();
    await core.destroy();
    element.remove();
  }
});
