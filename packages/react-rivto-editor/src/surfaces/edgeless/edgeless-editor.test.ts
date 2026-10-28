import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals/extension";
import { EdgelessEditor } from "./edgeless-editor";

test("projects document changes only while connected and preserves independent cameras across remount", async () => {
  const document = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({
    editor: document,
    extensions: [edgelessVisualsExtension({ toolbar: false })],
  });
  const first = new EdgelessEditor(panel);
  const second = new EdgelessEditor(panel);
  try {
    const stopFirst = first.connect();
    const stopSecond = second.connect();
    const element = first.tools.operations.create({
      kind: "rectangle",
      frame: { x: 10, y: 20, width: 100, height: 80 },
    });
    expect(first.canvas.getElement(element.id)?.frame.x).toBe(10);
    expect(second.canvas.getElement(element.id)?.frame.x).toBe(10);
    first.canvas.setCamera({ x: 45, y: 30, zoom: 1.5 });
    expect(second.canvas.camera.get()).toEqual({ x: 0, y: 0, zoom: 1 });
    stopFirst();
    panel.elements.updateElement(element.id, { frame: { x: 90 } });
    expect(first.canvas.getElement(element.id)?.frame.x).toBe(10);
    expect(second.canvas.getElement(element.id)?.frame.x).toBe(90);
    const stopRemount = first.connect();
    stopFirst();
    expect(first.canvas.getElement(element.id)?.frame.x).toBe(90);
    expect(first.canvas.camera.get()).toEqual({ x: 45, y: 30, zoom: 1.5 });
    panel.elements.updateElement(element.id, { frame: { x: 120 } });
    expect(first.canvas.getElement(element.id)?.frame.x).toBe(120);
    stopRemount();
    stopSecond();
  } finally {
    first.dispose();
    second.dispose();
    await panel.editor.destroy();
    await document.destroy();
  }
});
