/** @jest-environment ./jest-browser-environment.mjs */
import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ReactPanel } from "../react-panel";

it("routes local events and keyboard actions only to the current registration on a reused element", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = new ReactPanel(first.editor, new ChildrenPanel(core));
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const calls: string[] = [];
  first.events.register({ id: "first-click", type: "click" }, () => {
    calls.push("first-click");
  });
  second.events.register({ id: "second-click", type: "click" }, () => {
    calls.push("second-click");
  });
  first.keyboard.register({ id: "first-key", keys: "k" }, () => {
    calls.push("first-key");
    return false;
  });
  second.keyboard.register({ id: "second-key", keys: "k" }, () => {
    calls.push("second-key");
    return false;
  });
  try {
    first.setRoot(root);
    const previous = first.inputRegistration!;
    second.setRoot(root);
    expect(previous.isCurrent()).toBe(false);
    expect(first.inputRoot).toBeUndefined();
    expect(first.mountedRoot?.isForElement(root)).toBe(true);
    expect(second.inputRoot?.isAttached()).toBe(true);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(calls).toEqual(["second-click", "second-key"]);
  } finally {
    second.destroy();
    first.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("keeps the assigned identity during synchronous release without remounting the same surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  panel.setRoot(element);
  const occurrence = panel.mountedRoot!;
  const observed: boolean[] = [];
  const release = panel.page.events.onDetach(() => {
    observed.push(panel.hasInteractiveRoot());
    panel.setRoot(element);
  });
  try {
    panel.setRoot(null);
    expect(observed).toEqual([true]);
    expect(panel.hasInteractiveRoot()).toBe(false);
    expect(panel.mountedRoot).toBeUndefined();
    expect(occurrence.isAttached()).toBe(false);
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
  }
});

for (const scope of ["panel", "editor"] as const) {
  it(`does not invoke ${scope} keyboard actions after their availability check disables the occurrence`, async () => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    document.body.append(root);
    const calls: string[] = [];
    const keyboard = scope === "panel" ? panel.keyboard : panel.editor.keyboard;
    keyboard.register(
      {
        id: "disabled-during-predicate",
        keys: "k",
        when: () => {
          panel.setEnabled(false);
          return true;
        },
      },
      () => {
        calls.push("handler");
        return true;
      },
    );
    try {
      panel.setRoot(root);
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
      expect(calls).toEqual([]);
    } finally {
      panel.editor.destroy();
      await core.destroy();
      root.remove();
    }
  });
}
