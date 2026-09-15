/** Generic file fallback registration regression coverage. @module */
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { FILE_BLOCK_TYPE, FILE_ELEMENT_TYPE, fileExtension } from "./file";

describe("fileExtension", () => {
  test("prepares unknown MIME types as generic inline, block, and element attachments", async () => {
    const editor = createTestCoreEditor();
    const reactEditor = createReactEditor({ editor, extensions: [fileExtension()] });
    const reference = {
      uri: "data:application/pdf;base64,AA==",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 1,
    };

    await expect(reactEditor.files.preparePaste({ reference }, {
      destination: "block",
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      inline: expect.stringContaining("{{file "),
      block: { type: FILE_BLOCK_TYPE, props: reference },
      element: { type: FILE_ELEMENT_TYPE, props: reference },
    });
    expect(reactEditor.files.getElementView(FILE_ELEMENT_TYPE)).toBeDefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("contributes exact MIME bytes for one copied file block", async () => {
    const editor = createTestCoreEditor();
    const writes: string[] = [];
    let finishWrite: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { finishWrite = resolve; });
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        fileExtension(),
        {
          id: "file.writer",
          setup: (runtime) => runtime.clipboard.registerWriter({
            id: "host",
            supports: () => true,
            write: async ({ mimeType, data }) => {
              await data;
              writes.push(mimeType);
              finishWrite?.();
            },
          }),
        },
      ],
    });
    const id = reactEditor.blocks.insertBlock({
      type: FILE_BLOCK_TYPE,
      props: { uri: "data:application/pdf;base64,AA==", name: "report.pdf", mimeType: "application/pdf", size: 1 },
    });
    const block = editor.blocks.getBlock(id)!;

    reactEditor.clipboard.writeProcessed({ version: 4, blocks: [block] }, reactEditor.clipboard.format([block]));
    await written;
    expect(writes).toEqual(["application/pdf"]);
    reactEditor.destroy();
    editor.destroy();
  });
});
