/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { registerBlockClipboardActions } from "../actions";
import { standardPreset } from "../../built-ins";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it.each(["selection", "deletion"] as const)(
  "does not continue with an old attachment when %s replaces the panel root",
  async (phase) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const block = core.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
    const root = document.createElement("div");
    const replacement = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    replacement.dataset.rivtoBlockEditor = "true";
    root.tabIndex = 0;
    replacement.tabIndex = 0;
    document.body.append(root, replacement);
    registerBlockClipboardActions(panel.editor);
    panel.setRoot(root);
    root.focus();
    const focus = jestApi.spyOn(root, "focus");
    const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
    const originalSet = panel.selection.set.bind(panel.selection);
    const originalDelete = panel.selection.delete.bind(panel.selection);
    const set = jestApi.spyOn(panel.selection, "set");
    const remove = jestApi.spyOn(panel.selection, "delete");
    const replace = () => {
      panel.setRoot(null);
      panel.setRoot(replacement);
    };
    if (phase === "selection") {
      set.mockImplementation((selection) => {
        originalSet(selection);
        replace();
      });
    } else {
      remove.mockImplementation(() => {
        originalDelete();
        replace();
      });
    }
    try {
      const pending = panel.blockContextMenu.execute("block.delete", {
        blockId: block.id,
        blockIds: [block.id],
        rootIds: [block.id],
      });
      if (phase === "selection") {
        await expect(pending).rejects.toThrow("The invoking panel is no longer mounted");
      } else {
        await expect(pending).resolves.toBeUndefined();
      }
      expect(panel.mountedRoot?.isForElement(replacement)).toBe(true);
      expect(core.blocks.hasBlock(block.id)).toBe(phase === "selection");
      expect(focus).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
      remove.mockRestore();
      focus.mockRestore();
      schedule.mockRestore();
      panel.editor.destroy();
      await core.destroy();
      root.remove();
      replacement.remove();
    }
  },
);

it("does not restore a caret after deferred work outlives its attachment", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  document.body.append(root);
  registerBlockClipboardActions(panel.editor);
  panel.setRoot(root);
  root.focus();
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const read = jestApi.spyOn(panel.selection, "get");
  try {
    await panel.blockContextMenu.execute("block.delete", {
      blockId: block.id,
      blockIds: [block.id],
      rootIds: [block.id],
    });
    expect(core.blocks.hasBlock(block.id)).toBe(false);
    expect(callback).toBeDefined();
    panel.setRoot(null);
    panel.setRoot(root);
    read.mockClear();
    callback!();
    expect(read).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    read.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not cut from a replacement attachment after a delayed clipboard write", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({ editor: core, extensions: [standardPreset()] });
  const block = core.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  document.body.append(root);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let writeStarted = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: () => {
        writeStarted = true;
        return gate;
      },
    },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: class {
      /**
       * Creates a browser-independent clipboard item for the pending write.
       *
       * @param data - Clipboard MIME formats supplied by the action.
       */
      constructor(data: Record<string, Blob>) {}
    },
  });
  try {
    panel.setRoot(root);
    root.focus();
    const pending = panel.blockContextMenu.execute("clipboard.cut", {
      blockId: block.id,
      blockIds: [block.id],
      rootIds: [block.id],
    });
    expect(writeStarted).toBe(true);
    panel.setRoot(null);
    panel.setRoot(root);
    finish();
    await expect(pending).rejects.toThrow("The invoking panel is no longer mounted");
    expect(core.blocks.hasBlock(block.id)).toBe(true);
  } finally {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    if (originalItem) {
      Object.defineProperty(globalThis, "ClipboardItem", originalItem);
    } else {
      Reflect.deleteProperty(globalThis, "ClipboardItem");
    }
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
