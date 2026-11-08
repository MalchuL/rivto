import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { getSideBlocks } from "../side-blocks/side-blocks-store";
import { sideBlocksExtension } from "../side-blocks/side-blocks";
import { commentsExtension } from "./comments";

it("creates a shared message map with the thread so concurrent first replies merge", async () => {
  const leftCrdt = new YjsDoc("comments-left");
  const rightCrdt = new YjsDoc("comments-right");
  const left = new DocumentModelImpl(leftCrdt);
  const right = new DocumentModelImpl(rightCrdt);
  const core = await createTestCoreEditor({ document: left });
  const panel = createTestReactEditor({ editor: core, extensions: [commentsExtension()] });
  const anchor = panel.blocks.insertBlock({ type: "paragraph" });
  panel.slashCommands.execute("comment.create", { blockId: anchor.id });
  const thread = getSideBlocks(left)[0]!;
  const namespace = `rivto.comment-messages.${thread.id}`;
  rightCrdt.applySnapshot(leftCrdt.getSnapshot());
  left.pluginData.setField(namespace, "left", { content: "Left" });
  right.pluginData.setField(namespace, "right", { content: "Right" });
  const leftSnapshot = leftCrdt.getSnapshot();
  const rightSnapshot = rightCrdt.getSnapshot();
  leftCrdt.applySnapshot(rightSnapshot);
  rightCrdt.applySnapshot(leftSnapshot);
  expect(left.pluginData.get(namespace)).toEqual({
    created: true,
    left: { content: "Left" },
    right: { content: "Right" },
  });
  expect(right.pluginData.get(namespace)).toEqual(left.pluginData.get(namespace));
  await panel.editor.destroy();
  await core.destroy();
  await right.destroy();
});

it("releases page and canvas registrations when their extensions are removed", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const removeLayout = panel.editor.extensions.install(sideBlocksExtension({ renderers: {} }));
  const removeComments = panel.editor.extensions.install(commentsExtension());
  expect(panel.editor.surfaces.getEditorWrappers("block")).toHaveLength(1);
  expect(panel.editor.surfaces.getEditorWrappers("edgeless")).toHaveLength(1);
  expect(panel.editor.slashCommands.get("comment.create")).toBeDefined();
  removeComments();
  removeLayout();
  expect(panel.editor.surfaces.getEditorWrappers("block")).toHaveLength(0);
  expect(panel.editor.surfaces.getEditorWrappers("edgeless")).toHaveLength(0);
  expect(panel.editor.slashCommands.get("comment.create")).toBeUndefined();
  await panel.editor.destroy();
  await core.destroy();
});
