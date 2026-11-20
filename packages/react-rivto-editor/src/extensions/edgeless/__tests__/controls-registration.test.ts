/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCreationDefaults } from "../../../managers/elements/edgeless-creation-defaults";
import { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { edgelessVisualsExtension } from "../visuals/extension";
import { EdgelessControlsAdapter } from "../edgeless-controls-adapter";
import { EdgelessTransformController } from "../edgeless-transform";

it("rejects controls when their registration expires while their Root remains attached", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const element = document.createElement("div");
  document.body.append(element);
  try {
    panel.setRoot(element);
    const shape = operations.createElement({ type: "rectangle" });
    let current = true;
    const registration = { isCurrent: () => current };
    const adapter = new EdgelessControlsAdapter(
      controller,
      panel,
      panel.inputRoot,
      [shape.id],
      undefined,
      registration,
    );
    expect(adapter.getTargetIds()).toEqual([shape.id]);
    current = false;
    expect(panel.inputRoot?.isAttached()).toBe(true);
    expect(adapter.getTargetIds()).toEqual([]);
    expect(adapter.begin("resize", () => {})).toBe(false);
    expect(element.hasAttribute("data-transforming")).toBe(false);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
