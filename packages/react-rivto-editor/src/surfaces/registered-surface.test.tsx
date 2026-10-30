import { EdgelessSurfaceRegistration } from "./edgeless/register";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../test-utils";
import { edgelessSurfaceExtension } from "../extensions/edgeless";
import { EdgelessSurface } from "./edgeless/edgeless-surface";
import { RegisteredSurface } from "./registered-surface";

test("edgeless extension registers the package-backed host surface", async () => {
  const document = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: document,
    extensions: [edgelessSurfaceExtension()],
  });
  try {
    expect(panel.editor.surfaces.get("edgeless")).toBe(EdgelessSurface);
  } finally {
    await panel.editor.destroy();
    await document.destroy();
  }
});

test("explicit registered surface renders custom content and becomes empty after removal", async () => {
  const document = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: document });
  /**
   * Supplies host-specific markup without document dependencies.
   *
   * @returns Recognizable custom surface content.
   */
  function CustomSurface() {
    return <main>Custom canvas</main>;
  }
  const unregister = panel.editor.surfaces.register("edgeless", CustomSurface);
  const content = (
    <TestPanel panel={panel}>
      <RegisteredSurface mode="edgeless" />
    </TestPanel>
  );
  try {
    expect(renderToStaticMarkup(content)).toBe("<main>Custom canvas</main>");
    unregister();
    expect(renderToStaticMarkup(content)).toBe("");
  } finally {
    unregister();
    await panel.editor.destroy();
    await document.destroy();
  }
});

test("surface cleanup cannot erase defaults from a later registration", async () => {
  const document = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: document });
  try {
    const first = new EdgelessSurfaceRegistration(panel.editor, { blockElementWidth: 300 }).dispose;
    first();
    const second = new EdgelessSurfaceRegistration(panel.editor, { blockElementWidth: 600 })
      .dispose;
    first();
    expect(panel.editor.surfaces.get("edgeless")).toBe(EdgelessSurface);
    expect(EdgelessSurfaceRegistration.getOptions(panel.editor.surfaces).blockElementWidth).toBe(
      600,
    );
    second();
    expect(panel.editor.surfaces.get("edgeless")).toBeUndefined();
  } finally {
    await panel.editor.destroy();
    await document.destroy();
  }
});
