import { ChildrenPanel } from "@chulane/rivto";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { ReactPanel } from "./react-panel";

for (const name of ["editor", "extensions", "panel"] as const) {
  test(`${name} retains independent cleanup callbacks without replacing destroy`, async () => {
    const core = await createTestCoreEditor();
    const editor = createReactEditor({ editor: core });
    const panel = new ReactPanel(editor, new ChildrenPanel(core));
    let owner: Pick<typeof editor, "registerCleanup"> = editor;
    if (name === "panel") {
      owner = panel;
    } else if (name === "extensions") {
      owner = editor.extensions;
    }
    const destroy = () => (name === "panel" ? panel.destroy() : editor.destroy());
    const calls: string[] = [];
    const release = owner.registerCleanup(() => {
      calls.push("early");
    });
    owner.registerCleanup(() => {
      calls.push("throwing");
      throw new Error("cleanup failed");
    });
    owner.registerCleanup(() => {
      calls.push("remaining");
    });
    try {
      release();
      release();
      expect(calls).toEqual(["early"]);
      expect(destroy).toThrow("cleanup failed");
      expect(calls.sort()).toEqual(["early", "remaining", "throwing"]);
      expect(destroy).not.toThrow();
      expect(() => owner.registerCleanup(() => {})).toThrow(/destroyed/);
      expect(core.getDocument()).toBeDefined();
    } finally {
      panel.destroy();
      await editor.destroy();
      await core.destroy();
    }
  });
}

test("extension removal releases its callbacks while other consumers remain registered", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const calls: string[] = [];
  editor.extensions.registerCleanup(() => {
    calls.push("runtime");
  });
  const remove = editor.extensions.install({
    id: "cleanup-list",
    /**
     * Registers ordered fixture cleanup callbacks to verify panel teardown.
     *
     * @param reactEditor - React editor that owns the extension registrations.
     */
    setup(reactEditor) {
      reactEditor.extensions.registerCleanup(() => {
        calls.push("first");
      });
      reactEditor.extensions.registerCleanup(() => {
        calls.push("second");
      });
    },
  });
  try {
    remove();
    remove();
    expect(calls).toEqual(["second", "first"]);
    await editor.destroy();
    expect(calls).toEqual(["second", "first", "runtime"]);
  } finally {
    await editor.destroy();
    await core.destroy();
  }
});
