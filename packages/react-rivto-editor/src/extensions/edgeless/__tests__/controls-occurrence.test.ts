/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCreationDefaults } from "../../../managers/elements/edgeless-creation-defaults";
import { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { edgelessVisualsExtension } from "../visuals/extension";
import { EdgelessControlsAdapter } from "../edgeless-controls-adapter";
import { EdgelessTransformController } from "../edgeless-transform";

it("rejects controls captured before the same surface was remounted", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    const adapter = new EdgelessControlsAdapter(
      controller,
      panel,
      panel.inputRoot,
      [element.id],
      undefined,
      panel.inputRegistration,
    );
    const releaseOldControls = adapter.registerControls({
      prepareDrag: () => {},
      dragStart: () => {},
      stop: () => {},
    });
    panel.setRoot(null);
    panel.setRoot(root);
    expect(adapter.begin("resize", () => {})).toBe(false);
    expect(root.hasAttribute("data-transforming")).toBe(false);
    const current = new EdgelessControlsAdapter(
      controller,
      panel,
      panel.inputRoot,
      [element.id],
      undefined,
      panel.inputRegistration,
    );
    expect(current.begin("rotate", () => {})).toBe(true);
    expect(adapter.begin("resize", () => {})).toBe(false);
    adapter.finish(false);
    releaseOldControls();
    expect(root.getAttribute("data-transforming")).toBe("rotate");
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});
