/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessTransformController } from "../edgeless-transform";
import { installEdgelessRuntime } from "../../built-ins/selection/edgeless-runtime";

it("leaves a control inside an edgeless object to its own pointer handler", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "edgeless";
  const object = document.createElement("div");
  object.dataset.edgelessObjectKind = "rectangle";
  object.dataset.edgelessObjectId = "shape";
  const button = document.createElement("button");
  button.dataset.editorControl = "";
  object.append(button);
  root.append(object);
  document.body.append(root);
  const delivered: string[] = [];
  root.addEventListener("pointerdown", () => delivered.push("bubble"));
  const releaseSelection = installEdgelessRuntime(panel.editor);
  const controller = new EdgelessTransformController(panel.editor, null, null);
  let dispose: (() => void) | undefined;
  try {
    panel.setRoot(root);
    dispose = controller.setup(panel);
    button.focus();
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(delivered).toEqual(["bubble"]);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button);
  } finally {
    dispose?.();
    releaseSelection();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
