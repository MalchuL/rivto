import { splitBlockAt } from "../../block-behaviors/ops/text-ops";
import { defaultWritingBlockExtension } from "../../extensions/built-ins/built-ins";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

test("custom list behavior supplies split properties and visibility until its extension is removed", async () => {
  const core = await createTestCoreEditor();
  const editor = createTestReactEditor({ editor: core, extensions: [defaultWritingBlockExtension()] });
  const remove = editor.runtime.extensions.install({
    id: "custom.list",
    setup: (runtime) => runtime.blockListProps.register({
      id: "custom.list",
      defaults: { hidden: false, sequence: 0 },
      isValid: (value) => typeof value.hidden === "boolean" && typeof value.sequence === "number",
      childrenVisible: (block) => !block.listProps.hidden,
      prepareSplit: (block) => ({ hidden: false, sequence: Number(block.listProps.sequence) + 1 }),
    }),
  });
  const block = editor.runtime.blocks.insertBlock({ type: "paragraph", content: "abcd", listProps: { hidden: true, sequence: 7 } });
  expect(editor.runtime.blockListProps.childrenVisible(block)).toBe(false);
  core.history.clear();
  const next = core.history.batchUpdates(() => splitBlockAt(editor, block, 2));
  expect(editor.runtime.blocks.getBlockNode(block.id)?.content).toBe("ab");
  expect(next.content).toBe("cd");
  expect(next.listProps).toMatchObject({ hidden: false, sequence: 8 });
  core.history.undo();
  expect(editor.runtime.blocks.getBlockNode(block.id)?.content).toBe("abcd");
  expect(editor.runtime.blocks.hasBlock(next.id)).toBe(false);
  remove();
  expect(editor.runtime.blockListProps.childrenVisible(block)).toBe(true);
  expect(editor.runtime.blockListProps.prepareSplit(block)).toBeUndefined();
  editor.runtime.destroy(); core.destroy();
});
