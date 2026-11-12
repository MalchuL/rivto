/** Generic file fallback registration regression coverage. @module */
import { createReactEditor } from "../../editor/react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { FILE_BLOCK_TYPE, fileExtension } from "./file";
import { imageExtension } from "../image/image";

// Return a stable reference and leave reads unclaimed unless a test overrides the provider.
const testProvider = { write: async () => "test:asset", read: async () => undefined };

describe("fileExtension", () => {
  test("image and file extensions select their own binary providers", async () => {
    const editor = await createTestCoreEditor();
    // Distinct references and bytes reveal which provider each handler selects.
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
    const image = { reference: { uri: "", name: "picture.png", mimeType: "image/png" } };
    const file = { reference: { uri: "", name: "document.pdf", mimeType: "application/pdf" } };
    expect(runtime.clipboard.selectFileHandler(image)?.provider).toBe(imageProvider);
    expect(runtime.clipboard.selectFileHandler(file)?.provider).toBe(fileProvider);
    await runtime.destroy();
    await editor.destroy();
  });

  test("prepares only the requested block representation for an unknown MIME type", async () => {
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
      Promise.resolve(
        reactEditor.clipboard.selectFileHandler({ reference })!.prepare(
          { reference },
          {
            destination: "block",
            signal: new AbortController().signal,
          },
        ),
      ),
    ).resolves.toMatchObject({
      kind: "block",
      type: FILE_BLOCK_TYPE,
      props: reference,
    });
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("contributes exact MIME bytes for one copied file block", async () => {
    const editor = await createTestCoreEditor();
    const writes: string[] = [];
    let finishWrite: (() => void) | undefined;
    // Wait for the host writer because binary postprocessing runs asynchronously.
    const written = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        fileExtension({ provider: testProvider }),
        {
          id: "file.writer",
          // Install a host clipboard writer for this runtime.
          setup: (runtime) =>
            runtime.clipboard.registerWriter({
              id: "host",
              // Accept the file's exact MIME type.
              supports: () => true,
              // Record the MIME type after the copied bytes are available.
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

test("removes its provider configuration when extension setup fails", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  runtime.clipboard.registerFileHandler({
    id: "file",
    provider: testProvider,
    // Occupy the file handler ID so extension setup fails during registration.
    prepare: ({ reference }) => ({ kind: "inline", content: reference.uri }),
  });
  expect(() => runtime.extensions.install(fileExtension({ provider: testProvider }))).toThrow();
  expect(runtime.extensions.getExtension("file")).toBeUndefined();
  await runtime.destroy();
  await editor.destroy();
});

test("removes image view configuration when extension setup fails", async () => {
  const { imageResizeMode } = await import("../image/view/image-view");
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  runtime.clipboard.registerFileHandler({
    id: "image",
    provider: testProvider,
    // Occupy the image handler ID so extension setup fails during registration.
    prepare: ({ reference }) => ({ kind: "inline", content: reference.uri }),
  });
  expect(() =>
    runtime.extensions.install(
      imageExtension({ provider: testProvider, views: { block: { resizeMode: "stretch" } } }),
    ),
  ).toThrow();
  expect(imageResizeMode(runtime, "block")).toBe("letterbox");
  await runtime.destroy();
  await editor.destroy();
});

test("file provider follows extension removal and reinstall", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const disposeFirst = runtime.extensions.install(fileExtension({ provider: testProvider }));
  expect(runtime.extensions.getExtension("file")?.fields.provider).toBe(testProvider);
  disposeFirst();
  expect(runtime.extensions.getExtension("file")).toBeUndefined();
  const disposeSecond = runtime.extensions.install(fileExtension({ provider: testProvider }));
  disposeFirst();
  expect(runtime.extensions.getExtension("file")?.fields.provider).toBe(testProvider);
  disposeSecond();
  expect(runtime.extensions.getExtension("file")).toBeUndefined();
  await runtime.destroy();
  await editor.destroy();
});

test("one file extension object can be installed in independent editors", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const extension = fileExtension({ provider: testProvider });
  const first = createReactEditor({ editor: firstCore, extensions: [extension] });
  const second = createReactEditor({ editor: secondCore, extensions: [extension] });
  expect(first.extensions.getExtension("file")).toBe(extension);
  expect(second.extensions.getExtension("file")).toBe(extension);
  await first.destroy();
  expect(second.extensions.getExtension("file")?.fields.provider).toBe(testProvider);
  await second.destroy();
  await firstCore.destroy();
  await secondCore.destroy();
});

test("stops clipboard postprocessing after the first binary contribution", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const visited: string[] = [];
  runtime.clipboard.registerPostprocessor({
    id: "first",
    // Contribute binary data so later postprocessors must not run.
    process: () => {
      visited.push("first");
      return { name: "file", mimeType: "text/plain", data: new Blob(["data"]) };
    },
  });
  runtime.clipboard.registerPostprocessor({
    id: "second",
    // Record an unexpected visit if processing continues past the first contribution.
    process: () => {
      visited.push("second");
      return undefined;
    },
  });
  runtime.clipboard.writeProcessed(
    { version: 4, blocks: [] },
    { plain: "", markdown: "", html: "" },
  );
  expect(visited).toEqual(["first"]);
  await runtime.destroy();
  await editor.destroy();
});

test("does not read binary data when more than one file is selected", async () => {
  const editor = await createTestCoreEditor();
  let reads = 0;
  const runtime = createReactEditor({
    editor,
    extensions: [
      fileExtension({
        provider: {
          write: async () => "test:file",
          // Count binary reads so multi-selection can be verified as read-free.
          read: async () => {
            reads += 1;
            return new Blob(["data"]);
          },
        },
      }),
    ],
  });
  const first = editor.blocks.insertBlock({
    type: FILE_BLOCK_TYPE,
    props: { uri: "test:first", name: "first", mimeType: "text/plain" },
  });
  const second = editor.blocks.insertBlock({
    type: FILE_BLOCK_TYPE,
    props: { uri: "test:second", name: "second", mimeType: "text/plain" },
  });
  runtime.clipboard.writeProcessed(
    { version: 4, blocks: [editor.blocks.getBlock(first.id)!, editor.blocks.getBlock(second.id)!] },
    { plain: "", markdown: "", html: "" },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads).toBe(0);
  await runtime.destroy();
  await editor.destroy();
});
