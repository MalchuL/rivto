import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

test("Markdown contributions are ordered and removed with their extension", async () => {
  const core = await createTestCoreEditor();
  const runtime = createTestReactEditor({ editor: core });
  const first = { remarkPlugins: [] };
  const second = { rehypePlugins: [] };
  const changes: number[] = [];
  runtime.editor.markdown.subscribe(() => changes.push(runtime.editor.markdown.revision));
  const remove = runtime.editor.extensions.install({
    id: "markdown-test",
    setup: (editor) => {
      editor.markdown.register(first);
      editor.markdown.register(second);
    },
  });
  expect(runtime.editor.markdown.get()).toEqual([first, second]);
  remove();
  expect(runtime.editor.markdown.get()).toEqual([]);
  expect(changes).toHaveLength(4);
  runtime.editor.destroy();
  await core.destroy();
});

test("file and image extensions do not register Markdown contributions", async () => {
  const { fileExtension } = await import("../../extensions/file/file");
  const { imageExtension } = await import("../../extensions/image/image");
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const provider = { write: async () => "test:file", read: async () => undefined };
  const removeFile = panel.editor.extensions.install(fileExtension({ provider }));
  const removeImage = panel.editor.extensions.install(imageExtension({ provider }));
  expect(panel.editor.markdown.get()).toEqual([]);
  expect(panel.editor.markdown.revision).toBe(0);
  expect(panel.editor.clipboard.getFileHandler("file")).toBeDefined();
  expect(panel.editor.clipboard.getFileHandler("image")).toBeDefined();
  removeImage();
  removeFile();
  expect(panel.editor.markdown.revision).toBe(0);
  panel.editor.destroy();
  await core.destroy();
});

test("disposing repeated contributions removes the exact registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const repeated = { plainTextSafe: true };
  const middle = { plainTextSafe: false };
  panel.editor.markdown.register(repeated);
  panel.editor.markdown.register(middle);
  const removeLast = panel.editor.markdown.register(repeated);
  removeLast();
  expect(panel.editor.markdown.get()).toEqual([repeated, middle]);
  panel.editor.destroy();
  await core.destroy();
});
