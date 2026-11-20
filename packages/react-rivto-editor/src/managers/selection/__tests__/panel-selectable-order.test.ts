/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { createTextSelection } from "@chulane/rivto";
import { textSelectionEdge } from "../../../extensions/built-ins/page/navigation/utils/selection";

it("reads selectable order only while the panel owns the attached Page occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const first = core.blocks.insertBlock({ type: "paragraph", content: "First" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "Second" });
  try {
    expect(panel.selection.selectableBlockIds()).toBeUndefined();
    panel.setRoot(root);
    expect(panel.selection.selectableBlockIds()).toEqual([first.id, second.id]);
    const range = createTextSelection(
      [
        { id: first.id, length: 5 },
        { id: second.id, length: 6 },
      ],
      { blockId: second.id, offset: 4 },
      { blockId: first.id, offset: 1 },
    )!;
    expect(textSelectionEdge(panel, panel, range, "start")).toEqual({
      blockId: first.id,
      offset: 1,
    });
    expect(textSelectionEdge(panel, panel, range, "end")).toEqual({
      blockId: second.id,
      offset: 4,
    });
    panel.setRoot(null);
    expect(panel.selection.selectableBlockIds()).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
