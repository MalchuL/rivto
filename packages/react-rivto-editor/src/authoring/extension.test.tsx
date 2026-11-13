import { blockExtension, elementExtension } from "./extension";
import { createTestCoreEditor, createTestReactEditor } from "../test-utils";

test("authoring extensions install and release block and element types without deleting content", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const removeBlock = panel.editor.extensions.install(
    blockExtension({ definition: { type: "authoring.block" }, render: () => null }),
  );
  const removeElement = panel.editor.extensions.install(
    elementExtension({
      definition: { type: "authoring.element", defaults: { label: "Example" } },
      render: () => null,
      creation: { title: "Example", create: () => ({ type: "authoring.element" }) },
    }),
  );
  const block = core.blocks.insertBlock({ type: "authoring.block" });
  const element = core.elements.insertElement({
    type: "authoring.element",
    frame: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 0,
  });
  expect(panel.editor.edgelessToolbar.getTool("element:authoring.element")).toBeDefined();
  removeElement();
  removeBlock();
  expect(panel.editor.blockTypes.getDefinition("authoring.block")).toBeUndefined();
  expect(panel.editor.elementTypes.get("authoring.element")).toBeUndefined();
  expect(panel.editor.edgelessToolbar.getTool("element:authoring.element")).toBeUndefined();
  expect(core.blocks.getBlockNode(block.id)).toBeDefined();
  expect(core.elements.getElementNode(element.id)?.props.label).toBe("Example");
  panel.editor.destroy();
  await core.destroy();
});
