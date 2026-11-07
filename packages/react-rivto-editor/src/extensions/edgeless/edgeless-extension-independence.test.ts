import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { getEdgelessRuntime } from "../../managers/selection/edgeless/edgeless-runtime";
import { edgelessDeletionExtension, edgelessMovementExtension } from "./index";

test("installs edgeless movement and deletion without the selection extension", async () => {
  const editor = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({
    editor,
    extensions: [edgelessMovementExtension(), edgelessDeletionExtension()],
  });
  try {
    const selection = getEdgelessRuntime(panel);
    const id = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: {},
    }).id;
    selection.set([id]);
    expect(selection.get()).toEqual({ active: true, items: [id] });
  } finally {
    await panel.editor.destroy();
    await editor.destroy();
  }
});
