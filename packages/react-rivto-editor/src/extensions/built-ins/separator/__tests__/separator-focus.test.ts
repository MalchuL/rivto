/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { defaultWritingBlockExtension } from "../../built-ins";
import { separatorBlockExtension } from "../separator-block";
import { createCaretSelection } from "@chulane/rivto";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not focus a replacement surface for an earlier separator action", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
  });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
  const oldRoot = document.createElement("div");
  const newRoot = document.createElement("div");
  oldRoot.dataset.rivtoBlockEditor = "true";
  newRoot.dataset.rivtoBlockEditor = "true";
  const originalFrame = globalThis.requestAnimationFrame;
  let scheduled: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = (callback) => {
    scheduled = callback;
    return 1;
  };
  const focus = jestApi.spyOn(panel.selection, "focusBlock").mockReturnValue(true);
  try {
    panel.setRoot(oldRoot);
    panel.slashCommands.execute("block.separator.insert", { blockId: first });
    const stale = scheduled;
    panel.setRoot(newRoot);
    stale!(0);
    expect(focus).not.toHaveBeenCalled();
    panel.slashCommands.execute("block.separator.insert", { blockId: first });
    const interrupted = scheduled!;
    panel.selection.set(createCaretSelection(first, 0));
    interrupted(0);
    expect(focus).not.toHaveBeenCalled();
    panel.slashCommands.execute("block.separator.insert", { blockId: first });
    const remounted = scheduled!;
    panel.setRoot(null);
    panel.setRoot(newRoot);
    remounted(0);
    expect(focus).not.toHaveBeenCalled();
    scheduled = undefined;
    panel.slashCommands.execute("block.separator.insert", { blockId: first });
    const writingId = panel.selection.get()?.focusBlockId;
    expect(writingId).toBeTruthy();
    scheduled!(0);
    expect(focus).toHaveBeenCalledWith(writingId, 0);
  } finally {
    focus.mockRestore();
    globalThis.requestAnimationFrame = originalFrame;
    panel.editor.destroy();
    await core.destroy();
  }
});
