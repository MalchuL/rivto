/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not deliver to a handler when its availability predicate replaces the registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const listener = jestApi.fn();
  panel.editor.events.register(
    {
      id: "stale-predicate",
      type: "click",
      when: () => {
        panel.setEnabled(false);
        panel.setEnabled(true);
        return true;
      },
    },
    listener,
  );
  try {
    panel.setRoot(root);
    root.click();
    expect(listener).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not deliver when the final Root check destroys the event owner", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const listener = jestApi.fn();
  panel.editor.events.register(
    {
      id: "destroy-during-root-check",
      type: "click",
      when: (event) => {
        jestApi.spyOn(event.inputRoot, "isAttached").mockImplementationOnce(() => {
          panel.editor.destroy();
          return true;
        });
        return true;
      },
    },
    listener,
  );
  try {
    panel.setRoot(root);
    root.click();
    expect(listener).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    jestApi.restoreAllMocks();
    await core.destroy();
  }
});
