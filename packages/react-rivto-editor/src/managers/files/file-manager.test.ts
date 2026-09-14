/** File pipeline ordering, limits, and URI resolution regression tests. */
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../editor/react-editor";
import type { ReactEditorApi } from "../../editor/types";

describe("FileManager", () => {
  test("enforces handler bytes and applies postprocessors in order", async () => {
    const editor = await createTestCoreEditor();
    let runtime: ReactEditorApi | undefined;
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        {
          id: "files.test",
          setup: (value) => {
            runtime = value;
            value.files.registerUploadHandler({ id: "host", maxBytes: 3, upload: () => "asset:a" });
            value.files.registerPostprocessor({ id: "one", process: (uri) => `${uri}:one` });
            value.files.registerPostprocessor({ id: "two", process: async (uri) => `${uri}:two` });
          },
        },
      ],
    });
    const context = {
      source: "drop" as const,
      destination: "block" as const,
      signal: new AbortController().signal,
    };

    await expect(
      runtime!.files.upload({ name: "large.png", size: 4 } as File, context),
    ).rejects.toThrow(/3-byte limit.*maxBytes/);
    await expect(runtime!.files.upload({ name: "ok.png", size: 3 } as File, context)).resolves.toBe(
      "asset:a:one:two",
    );
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("preserves the initiating surface mode for asynchronous file work", async () => {
    const editor = await createTestCoreEditor();
    const modes: string[] = [];
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        {
          id: "files.mode",
          setup: (runtime) => {
            runtime.files.registerUploadHandler({
              id: "mode",
              upload: (_file, context) => {
                modes.push(context.mode);
                return "asset:test";
              },
            });
            runtime.files.registerUriResolver({
              id: "mode",
              resolve: (_uri, context) => {
                modes.push(context.mode);
                return "https://example.test/file";
              },
            });
          },
        },
      ],
    });
    const signal = new AbortController().signal;
    await reactEditor.files.upload(new File(["a"], "a.txt"), {
      source: "drop",
      destination: "element",
      mode: "edgeless",
      signal,
    });
    await reactEditor.files.resolve("asset:test", { mode: "edgeless", signal });
    expect(modes).toEqual(["edgeless", "edgeless"]);
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("resolves relative URIs against the configured document base", async () => {
    const editor = await createTestCoreEditor();
    const reactEditor = createReactEditor({
      editor,
      files: { documentBaseUri: "https://example.test/pages/note" },
    });

    await expect(
      reactEditor.files.resolve("../assets/a.png", { signal: new AbortController().signal }),
    ).resolves.toBe("https://example.test/assets/a.png");
    await expect(
      reactEditor.files.resolve("file:///tmp/a.png", { signal: new AbortController().signal }),
    ).rejects.toThrow(/No file URI resolver/);
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("uses the first matching paste handler before the default", async () => {
    const editor = await createTestCoreEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        {
          id: "files.handlers",
          setup: (runtime) => {
            runtime.files.registerPasteHandler({
              id: "image",
              matches: ({ reference }) => reference.mimeType.startsWith("image/"),
              prepare: ({ reference }) => ({
                inline: "image",
                block: { type: "image", props: { ...reference } },
                element: { type: "image", props: { ...reference }, width: 2, height: 2 },
              }),
            });
            runtime.files.registerPasteHandler({
              id: "file",
              prepare: ({ reference }) => ({
                inline: "file",
                block: { type: "file", props: { ...reference } },
                element: { type: "file", props: { ...reference }, width: 1, height: 1 },
              }),
            });
          },
        },
      ],
    });
    const signal = new AbortController().signal;
    const image = { reference: { uri: "a", name: "a.png", mimeType: "image/png", size: 1 } };
    const file = { reference: { uri: "b", name: "b.pdf", mimeType: "application/pdf", size: 2 } };

    await expect(
      reactEditor.files.preparePaste(image, { destination: "block", signal }),
    ).resolves.toMatchObject({ block: { type: "image" } });
    await expect(
      reactEditor.files.preparePaste(file, { destination: "block", signal }),
    ).resolves.toMatchObject({ block: { type: "file" } });
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("uses a typed open handler before the matcher-less host fallback", async () => {
    const editor = await createTestCoreEditor();
    const opened: string[] = [];
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        {
          id: "files.open-handlers",
          setup: (runtime) => {
            runtime.files.registerOpenHandler({
              id: "native",
              open: ({ name }) => {
                opened.push(`native:${name}`);
              },
            });
            runtime.files.registerOpenHandler({
              id: "pdf",
              matches: ({ mimeType }) => mimeType === "application/pdf",
              open: ({ name }) => {
                opened.push(`pdf:${name}`);
              },
            });
          },
        },
      ],
    });
    const signal = new AbortController().signal;

    await reactEditor.files.open(
      { uri: "report", name: "report.pdf", mimeType: "application/pdf" },
      { signal },
    );
    await reactEditor.files.open(
      { uri: "notes", name: "notes.txt", mimeType: "text/plain" },
      { signal },
    );

    expect(opened).toEqual(["pdf:report.pdf", "native:notes.txt"]);
    await reactEditor.destroy();
    await editor.destroy();
  });
});
