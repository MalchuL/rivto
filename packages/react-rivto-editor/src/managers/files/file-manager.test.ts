/** File pipeline ordering, limits, and URI resolution regression tests. */
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../editor/react-editor";
import type { ReactEditorApi } from "../../editor/types";

const testProvider = { write: async () => "test:asset", read: async () => undefined };

describe("FileManager", () => {
  test("routes writes to the matching provider and preserves context", async () => {
    const editor = await createTestCoreEditor();
    const calls: string[] = [];
    const provider = (id: string) => ({
      write: async (_data: Blob, context: import("./binary-provider").BinaryWriteContext) => {
        calls.push(`${id}:${context.mode}:${context.name}`);
        return `${id}:asset`;
      },
      read: async (uri: string) => (uri.startsWith(id + ":") ? new Blob([id]) : undefined),
    });
    const reactEditor = createReactEditor({
      editor,
      extensions: [
        {
          id: "routing",
          /** Installs the test providers. */
          setup(runtime) {
            const prepare = ({ reference }: import("./file-manager").FilePasteCandidate) => ({
              inline: reference.uri,
              block: { type: "file", props: { ...reference } },
              element: { type: "file", props: { ...reference }, width: 1, height: 1 },
            });
            runtime.files.registerPasteHandler({ id: "file", provider: provider("file"), prepare });
            runtime.files.registerPasteHandler({
              id: "image",
              provider: provider("image"),
              matches: ({ reference }) => reference.mimeType.startsWith("image/"),
              prepare,
            });
          },
        },
      ],
    });
    const context = {
      source: "drop" as const,
      destination: "element" as const,
      mode: "edgeless" as const,
      signal: new AbortController().signal,
    };
    await expect(
      reactEditor.files.upload(new File(["x"], "pic.png", { type: "image/png" }), context),
    ).resolves.toBe("image:asset");
    await expect(
      reactEditor.files.upload(new File(["x"], "doc.txt", { type: "text/plain" }), context),
    ).resolves.toBe("file:asset");
    expect(calls).toEqual(["image:edgeless:pic.png", "file:edgeless:doc.txt"]);
    await expect(
      reactEditor.files.resolve("image:asset", { signal: context.signal, providerId: "image" }),
    ).resolves.toBeInstanceOf(Blob);
    await expect(
      reactEditor.files.resolve("https://example.test/a", { signal: context.signal }),
    ).resolves.toBe("https://example.test/a");
    await expect(
      reactEditor.files.resolve("image:asset", { signal: context.signal, providerId: "file" }),
    ).rejects.toThrow();
    await reactEditor.destroy();
    await editor.destroy();
  });

  test("propagates provider failures and cancellation without falling back", async () => {
    const editor = await createTestCoreEditor();
    const provider = {
      write: async () => {
        throw new Error("write failed");
      },
      read: async () => {
        throw new Error("read failed");
      },
    };
    const runtime = createReactEditor({
      editor,
      extensions: [
        {
          id: "failing",
          /** Installs the failing provider. */
          setup(value) {
            value.files.registerPasteHandler({
              id: "file",
              provider,
              prepare: () => {
                throw new Error("unused");
              },
            });
          },
        },
      ],
    });
    const controller = new AbortController();
    await expect(
      runtime.files.upload(new File(["x"], "x.txt"), {
        source: "drop",
        destination: "block",
        signal: controller.signal,
      }),
    ).rejects.toThrow("write failed");
    await expect(
      runtime.files.resolve("https://example.test/file", { signal: controller.signal }),
    ).rejects.toThrow("read failed");
    controller.abort();
    await expect(
      runtime.files.resolve("https://example.test/file", { signal: controller.signal }),
    ).rejects.toThrow();
    await runtime.destroy();
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
              provider: testProvider,
              matches: ({ reference }) => reference.mimeType.startsWith("image/"),
              prepare: ({ reference }) => ({
                inline: "image",
                block: { type: "image", props: { ...reference } },
                element: { type: "image", props: { ...reference }, width: 2, height: 2 },
              }),
            });
            runtime.files.registerPasteHandler({
              id: "file",
              provider: testProvider,
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
