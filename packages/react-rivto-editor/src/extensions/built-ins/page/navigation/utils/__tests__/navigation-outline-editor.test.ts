/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { navigationOutlineBlocks } from "../scope";

it("uses the document outline when the editor has no surface capability", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  try {
    expect(navigationOutlineBlocks(panel.editor, block.id).map((item) => item.id)).toContain(
      block.id,
    );
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
