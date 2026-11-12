import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { collapseExtension, standardPreset } from "./built-ins";

test("installs preset children as discoverable extensions and removes them with the preset", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({ editor: core });
  const extensions = panel.editor.extensions;
  const remove = extensions.install(standardPreset());
  expect(extensions.getExtension("block.collapse")?.fields.canPasteIntoChildren).toBeDefined();
  remove();
  expect(extensions.getExtension("block.collapse")).toBeUndefined();
  await panel.editor.destroy();
  await core.destroy();
});

test("rolls back preset children when a nested extension is already installed", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({ editor: core });
  const extensions = panel.editor.extensions;
  const collapse = collapseExtension();
  const remove = extensions.install(collapse);
  expect(() => extensions.install(standardPreset())).toThrow(/already registered/);
  expect(extensions.getExtension("block.collapse")).toBe(collapse);
  remove();
  const retry = extensions.install(standardPreset());
  expect(extensions.getExtension("block.collapse")).toBeDefined();
  retry();
  await panel.editor.destroy();
  await core.destroy();
});
