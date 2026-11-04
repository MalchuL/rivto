/** Attachment classification and binary access boundaries. @module */
import { createTestCoreEditor } from "../test-utils";
import { createReactEditor } from "../editor/react-editor";
import type { FileReference } from "./types";

const provider = { write: async () => "stored:test", read: async () => undefined };
// Prepare an inline representation using the stored reference for handler tests.
const prepare = ({ reference }: { reference: FileReference }) => ({
  kind: "inline" as const,
  content: reference.uri,
});

test("clipboard file handlers select specific handlers before the default and cleans up", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [
      {
        id: "handlers",
        /**
         * Installs the attachment handlers for this test runtime.
         *
         * @param value - Runtime receiving the generic and image handlers.
         * @returns Completes handler registration and default selection.
         */
        setup(value) {
          value.clipboard.registerFileHandler({ id: "file", provider, prepare });
          value.clipboard.setDefaultFileHandler("file");
          value.clipboard.registerFileHandler({
            id: "image",
            provider,
            matches: ({ reference }) => reference.mimeType.startsWith("image/"),
            prepare,
          });
        },
      },
    ],
  });
  const image = { reference: { uri: "a", name: "a.png", mimeType: "image/png" } };
  const file = { reference: { uri: "b", name: "b.pdf", mimeType: "application/pdf" } };
  expect(runtime.clipboard.selectFileHandler(image)?.id).toBe("image");
  expect(runtime.clipboard.selectFileHandler(file)?.id).toBe("file");
  await runtime.destroy();
  expect(runtime.clipboard.selectFileHandler(image)).toBeUndefined();
  await editor.destroy();
});

test("binary access propagates provider failures and falls back only for unclaimed browser URLs", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    attachments: { documentBaseUri: "https://example.test/assets/" },
  });
  const controller = new AbortController();
  const signal = controller.signal;
  await expect(
    runtime.attachments.resolveBinary(provider, "https://example.test/a", { signal }),
  ).resolves.toBe("https://example.test/a");
  await expect(runtime.attachments.resolveBinary(provider, "image.png", { signal })).resolves.toBe(
    "https://example.test/assets/image.png",
  );
  const failing = {
    ...provider,
    read: async () => {
      throw new Error("read failed");
    },
  };
  await expect(
    runtime.attachments.readBinary(failing, "https://example.test/a", "text/plain", { signal }),
  ).rejects.toThrow("read failed");
  await expect(
    runtime.attachments.resolveBinary(provider, "unknown:asset", { signal }),
  ).rejects.toThrow(/No binary provider/);
  controller.abort();
  await expect(
    runtime.attachments.resolveBinary(provider, "https://example.test/a", { signal }),
  ).rejects.toThrow();
  await runtime.destroy();
  await editor.destroy();
});

test("resolves provider blobs and returns bytes with the requested MIME type", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const signal = new AbortController().signal;
  const original = new Blob(["content"], { type: "text/plain" });
  const owningProvider = { ...provider, read: async () => original };

  await expect(
    runtime.attachments.resolveBinary(owningProvider, "stored:asset", { signal }),
  ).resolves.toBe(original);
  await expect(
    runtime.attachments.readBinary(owningProvider, "stored:asset", "text/plain", { signal }),
  ).resolves.toBe(original);
  const converted = await runtime.attachments.readBinary(
    owningProvider,
    "stored:asset",
    "application/example",
    { signal },
  );
  expect(converted.type).toBe("application/example");
  expect(converted.size).toBe(original.size);
  await runtime.destroy();
  await editor.destroy();
});

test("file opening prefers a typed handler and then the fallback", async () => {
  const editor = await createTestCoreEditor();
  const opened: string[] = [];
  const runtime = createReactEditor({
    editor,
    extensions: [
      {
        id: "openers",
        /**
         * Installs the typed and default opener fixtures.
         *
         * @param value - Runtime receiving the file openers.
         * @returns Completes opener registration and default selection.
         */
        setup(value) {
          value.attachments.registerFileOpenHandler({
            id: "default",
            open: ({ name }) => {
              opened.push(`default:${name}`);
            },
          });
          value.attachments.setDefaultFileOpenHandler("default");
          value.attachments.registerFileOpenHandler({
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
  const unreadableProvider = {
    ...provider,
    read: async () => {
      throw new Error("the host opener must not read the provider");
    },
  };
  await runtime.attachments.openBinary(
    unreadableProvider,
    { uri: "a", name: "a.pdf", mimeType: "application/pdf" },
    { signal },
  );
  await runtime.attachments.openBinary(
    provider,
    { uri: "b", name: "b.txt", mimeType: "text/plain" },
    { signal },
  );
  expect(opened).toEqual(["pdf:a.pdf", "default:b.txt"]);
  expect(() =>
    runtime.attachments.registerFileOpenHandler({ id: "default", open: () => {} }),
  ).toThrow();
  await runtime.destroy();
  expect(
    runtime.attachments.selectFileOpenHandler({
      uri: "a",
      name: "a.pdf",
      mimeType: "application/pdf",
    }),
  ).toBeUndefined();
  await editor.destroy();
});

test("file handler defaults require registration and clear when the selected handler is removed", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const candidate = { reference: { uri: "a", name: "a.txt", mimeType: "text/plain" } };
  const dispose = runtime.clipboard.registerFileHandler({ id: "file", provider, prepare });
  const disposeOther = runtime.clipboard.registerFileHandler({ id: "other", provider, prepare });
  expect(runtime.clipboard.selectFileHandler(candidate)).toBeUndefined();
  expect(() => runtime.clipboard.setDefaultFileHandler("missing")).toThrow(/not registered/);
  runtime.clipboard.setDefaultFileHandler("file");
  expect(runtime.clipboard.selectFileHandler(candidate)?.id).toBe("file");
  runtime.clipboard.setDefaultFileHandler("other");
  dispose();
  expect(runtime.clipboard.selectFileHandler(candidate)?.id).toBe("other");
  disposeOther();
  expect(runtime.clipboard.selectFileHandler(candidate)).toBeUndefined();
  await runtime.destroy();
  await editor.destroy();
});

test("file opener defaults require registration and clear when the selected opener is removed", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const reference = { uri: "a", name: "a.txt", mimeType: "text/plain" };
  const first = runtime.attachments.registerFileOpenHandler({ id: "first", open: () => {} });
  const second = runtime.attachments.registerFileOpenHandler({ id: "second", open: () => {} });
  expect(runtime.attachments.selectFileOpenHandler(reference)).toBeUndefined();
  expect(() => runtime.attachments.setDefaultFileOpenHandler("missing")).toThrow(/not registered/);
  runtime.attachments.setDefaultFileOpenHandler("first");
  runtime.attachments.setDefaultFileOpenHandler("second");
  first();
  expect(runtime.attachments.selectFileOpenHandler(reference)?.id).toBe("second");
  second();
  expect(runtime.attachments.selectFileOpenHandler(reference)).toBeUndefined();
  await runtime.destroy();
  await editor.destroy();
});

test("explicit defaults do not precede matching handlers even when their own predicate matches", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  const reference = { uri: "a", name: "a.txt", mimeType: "text/plain" };
  runtime.clipboard.registerFileHandler({
    id: "default",
    provider,
    prepare,
    matches: () => true,
  });
  runtime.clipboard.registerFileHandler({
    id: "specific",
    provider,
    prepare,
    matches: () => true,
  });
  runtime.clipboard.setDefaultFileHandler("default");
  expect(runtime.clipboard.selectFileHandler({ reference })?.id).toBe("specific");
  runtime.attachments.registerFileOpenHandler({
    id: "default",
    open: () => {},
    matches: () => true,
  });
  runtime.attachments.registerFileOpenHandler({
    id: "specific",
    open: () => {},
    matches: () => true,
  });
  runtime.attachments.setDefaultFileOpenHandler("default");
  expect(runtime.attachments.selectFileOpenHandler(reference)?.id).toBe("specific");
  await runtime.destroy();
  await editor.destroy();
});
