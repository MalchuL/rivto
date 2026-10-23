import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { blockSelectionExtension } from "../../extensions/built-ins/built-ins";
import { PAGE_SELECTION_BINDINGS, PageSelectionExtension } from "./page-selection-extension";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("owns independent Page feature groups and releases their shared-keymap observer", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [blockSelectionExtension()] });
  const host = panel.editor.keyboard;
  const page = panel.page;
  const subscribe = jestApi.spyOn(host, "subscribe");
  try {
    const block = page.extensions.register(
      "test.block",
      new PageSelectionExtension(panel.pageSelectionFeatures, host, "block"),
    );
    const text = page.extensions.register(
      "test.text",
      new PageSelectionExtension(panel.pageSelectionFeatures, host, "text"),
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(
      page.keyboard.list().find(({ id }) => id === PAGE_SELECTION_BINDINGS.toggle)?.keys,
    ).toEqual(["Control", "Meta"]);
    host.setKeymapOverride(PAGE_SELECTION_BINDINGS.toggle, ["Alt"]);
    expect(
      page.keyboard.list().find(({ id }) => id === PAGE_SELECTION_BINDINGS.toggle)?.keys,
    ).toEqual(["Alt"]);
    expect(() =>
      page.events.observe(
        "selection.change",
        { type: "selectionchange", target: "document", priority: 0 },
        () => {},
      ),
    ).toThrow();
    text();
    const probe = page.events.observe(
      "selection.change",
      { type: "selectionchange", target: "document", priority: 0 },
      () => {},
    );
    expect(page.keyboard.list().some(({ id }) => id === PAGE_SELECTION_BINDINGS.toggle)).toBe(true);
    block();
    host.setKeymapOverride(PAGE_SELECTION_BINDINGS.toggle, ["Shift"]);
    expect(page.keyboard.list()).toEqual([]);
    probe();
    const remount = page.extensions.register(
      "test.text",
      new PageSelectionExtension(panel.pageSelectionFeatures, host, "text"),
    );
    remount();
  } finally {
    subscribe.mockRestore();
    panel.editor.destroy();
    core.destroy();
  }
});

test("rolls back feature state when a later native registration fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  try {
    const conflict = panel.page.events.observe(
      "selection.change",
      { type: "selectionchange", target: "document", priority: 0 },
      () => {},
    );
    expect(() =>
      panel.page.extensions.register(
        "test.text",
        new PageSelectionExtension(panel.pageSelectionFeatures, panel.editor.keyboard, "text"),
      ),
    ).toThrow();
    conflict();
    expect(panel.page.keyboard.list()).toEqual([]);
    const release = panel.page.extensions.register(
      "test.text",
      new PageSelectionExtension(panel.pageSelectionFeatures, panel.editor.keyboard, "text"),
    );
    release();
  } finally {
    panel.editor.destroy();
    core.destroy();
  }
});
