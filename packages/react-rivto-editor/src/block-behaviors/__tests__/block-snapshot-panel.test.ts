import type { BlockSnapshotContext } from "../types";
import { createBlockSnapshotContext } from "../utils/context";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

it("borrows the existing panel through the structural behavior contract", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "snapshot" });
  try {
    const context: BlockSnapshotContext | undefined = createBlockSnapshotContext(panel, block.id);
    expect(context?.reactPanel).toBe(panel);
    expect(context?.block.content).toBe("snapshot");
    const hasRoot: "getRoot" extends keyof BlockSnapshotContext["reactPanel"] ? true : false =
      false;
    const canDestroy: "destroy" extends keyof BlockSnapshotContext["reactPanel"]["document"]
      ? true
      : false = false;
    const canRegister: "registerCleanup" extends keyof BlockSnapshotContext["reactPanel"]
      ? true
      : false = false;
    expect([hasRoot, canDestroy, canRegister]).toEqual([false, false, false]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
