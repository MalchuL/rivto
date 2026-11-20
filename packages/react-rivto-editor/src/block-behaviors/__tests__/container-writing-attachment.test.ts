/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { scheduleBlockFocus } from "../utils/focus-ops";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("schedules focus without a DOM root only for the originating mounted occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  try {
    panel.setRoot(root);
    const attachment = panel.inputRoot!;
    scheduleBlockFocus(panel, "block", 0, attachment);
    expect(schedule).toHaveBeenCalledTimes(1);
    panel.setRoot(null);
    panel.setRoot(root);
    schedule.mockClear();
    scheduleBlockFocus(panel, "block", 0, attachment);
    expect(schedule).not.toHaveBeenCalled();
    scheduleBlockFocus(panel, "block", 0, panel.inputRoot);
    expect(schedule).toHaveBeenCalledTimes(1);
  } finally {
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not insert into a container after its originating occurrence is detached", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  const batch = jestApi.spyOn(panel, "batchUpdates");
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    panel.setRoot(null);
    const { ContainerBlockBehavior } = await import("../container-block-behavior");
    class TestContainerBehavior extends ContainerBlockBehavior {
      /**
       * Enables this fixture for the selected block.
       *
       * @returns The fixture accepts the block.
       */
      isAvailable(): boolean {
        return true;
      }
    }
    const result = new TestContainerBehavior().appendWritingBlock({
      reactPanel: panel,
      block,
      inputRoot,
    });
    expect(result).toBe("unhandled");
    expect(batch).not.toHaveBeenCalled();
  } finally {
    batch.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
