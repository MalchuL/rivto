/** Generic file fallback registration regression coverage. @module */
import { createReactEditor } from "../../editor/react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { FILE_BLOCK_TYPE, FILE_ELEMENT_TYPE, fileExtension } from "./file";
import { imageExtension } from "../image/image";

const testProvider = { write: async () => "test:asset", read: async () => undefined };

describe("fileExtension", () => {
  test("image and file extensions select their own binary providers", async () => {
    const editor = await createTestCoreEditor();
    const imageProvider = {
      write: async () => "images:one",
      read: async () => new Blob(["image"]),
    };
    const fileProvider = { write: async () => "files:one", read: async () => new Blob(["file"]) };
    const runtime = createReactEditor({
      editor,
      extensions: [
        fileExtension({ provider: fileProvider }),
        imageExtension({ provider: imageProvider }),
      ],
    });
    const context = {
      source: "drop" as const,
      destination: "block" as const,
      signal: new AbortController().signal,
    };
    await expect(
      runtime.files.upload(new File(["x"], "picture.png", { type: "image/png" }), context),
    ).resolves.toBe("images:one");
    await expect(
      runtime.files.upload(new File(["x"], "document.pdf", { type: "application/pdf" }), context),
    ).resolves.toBe("files:one");
    await expect(
      runtime.files.resolve("images:one", { signal: context.signal, providerId: "image" }),
    ).resolves.toBeInstanceOf(Blob);
    await runtime.destroy();
    await editor.destroy();
  });

  test("prepares unknown MIME types as generic inline, block, and element attachments", async () => {
    const editor = await createTestCoreEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [fileExtension({ provider: testProvider })],
    });
    const reference = {
      uri: "data:application/pdf;base64,AA==",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 1,
    };

    await expect(
      reactEditor.files.preparePaste(
        { reference },
        {
          destination: "block",
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({
      inline: expect.stringContaining("{{file "),
      block: { type: FILE_BLOCK_TYPE, props: reference },
      element: { type: FILE_ELEMENT_TYPE, props: reference },
    });
    expect(reactEditor.files.getElementView(FILE_ELEMENT_TYPE)).toBeDefined();
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("contributes exact MIME bytes for one copied file block", async () => {
    const editor = await createTestCoreEditor();
    const writes: string[] = [];
    let finishWrite: (() => void) | undefined;
    const written = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        fileExtension({ provider: testProvider }),
        {
          id: "file.writer",
          setup: (runtime) =>
            runtime.clipboard.registerWriter({
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
      props: {
        uri: "data:application/pdf;base64,AA==",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 1,
      },
    }).id;
    const block = editor.blocks.getBlock(id)!;

    reactEditor.clipboard.writeProcessed(
      { version: 4, blocks: [block] },
      reactEditor.clipboardFormats.format([block]),
    );
    await written;
    expect(writes).toEqual(["application/pdf"]);
    await reactEditor.destroy();
    await editor.destroy();
  });
});
