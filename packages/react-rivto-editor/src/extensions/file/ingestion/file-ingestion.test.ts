import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { paragraphBlockFactory } from "../../../block-factories";
import { fileExtension } from "../file";
import { FileIngestion } from "./file-ingestion";
import type { FileIngestionStatus, FileIngestionStatuses } from "./types";

/**
 * Creates a canvas file representation for ingestion tests.
 *
 * @param name - File name stored in the prepared metadata.
 * @returns A complete canvas file representation.
 */
function preparedFile(name: string) {
  return {
    kind: "element" as const,
    type: "file",
    props: { uri: `test:${name}`, name, mimeType: "text/plain" },
    width: 240,
    height: 64,
  };
}

/**
 * Creates observable local feedback for an ingestion test.
 *
 * @returns The status map and the operations that update it.
 */
function feedbackStore() {
  const statuses = new Map<string, FileIngestionStatus & { error?: string }>();
  const feedback: FileIngestionStatuses = {
    set: (status) => {
      statuses.set(status.id, status);
    },
    update: (id, patch) => {
      Object.assign(statuses.get(id)!, patch);
    },
    delete: (id) => {
      statuses.delete(id);
    },
  };
  return { statuses, feedback };
}

const provider = { write: async () => "test:file", read: async () => undefined };

test("inserts successful jobs in source order and retries a failed job", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { statuses, feedback } = feedbackStore();
  let finishFirst: ((value: ReturnType<typeof preparedFile>) => void) | undefined;
  const first = new Promise<ReturnType<typeof preparedFile>>((resolve) => {
    finishFirst = resolve;
  });
  let failed = false;
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["first", "failed", "last"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async (item) => {
      if (item === "first") {
        return first;
      }
      if (item === "failed" && !failed) {
        failed = true;
        throw new Error("failed upload");
      }
      return preparedFile(item);
    },
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  expect(statuses.get("2")).toMatchObject({ x: 12, y: 12 });
  finishFirst!(preparedFile("first"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(panel.elements.getElements().map((element) => element.props.name)).toEqual([
    "first",
    "last",
  ]);
  expect(panel.elements.getElements().map((element) => element.zIndex)).toEqual([1, 2]);
  expect(statuses.get("2")?.error).toBe("failed upload");
  statuses.get("2")!.retry();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(panel.elements.getElements().map((element) => element.props.name)).toEqual([
    "first",
    "last",
    "failed",
  ]);
  expect(statuses.size).toBe(0);
  await panel.editor.destroy();
  await editor.destroy();
});

test("retains failed insertion feedback when a handler returns the wrong placement", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { statuses, feedback } = feedbackStore();
  const errors: unknown[] = [];
  const ingestion = new FileIngestion(feedback, (error) => errors.push(error));
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async () => ({ kind: "inline" as const, content: "file" }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(errors).toHaveLength(1);
  expect(statuses.get("1")?.error).toContain("does not match");
  expect(panel.elements.getElements()).toHaveLength(0);
  await panel.editor.destroy();
  await editor.destroy();
});

test("does not insert a prepared file after its extension is destroyed", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { feedback } = feedbackStore();
  let finish: ((value: ReturnType<typeof preparedFile>) => void) | undefined;
  const pending = new Promise<ReturnType<typeof preparedFile>>((resolve) => {
    finish = resolve;
  });
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: () => pending,
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  ingestion.destroy();
  finish!(preparedFile("file"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(ingestion.signal.aborted).toBe(true);
  expect(panel.elements.getElements()).toHaveLength(0);
  await panel.editor.destroy();
  await editor.destroy();
});

test("prepares a retry for its refreshed inline destination", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const block = editor.blocks.insertBlock({ type: "paragraph", content: "" });
  const { statuses, feedback } = feedbackStore();
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const destinations: string[] = [];
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "block", afterId: block.id, replaceId: block.id, content: "" },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async (_item, _id, destination) => {
      destinations.push(destination.kind);
      if (destination.kind === "block") {
        await pending;
        return {
          kind: "block",
          type: "file",
          props: { uri: "test:file", name: "file", mimeType: "text/plain" },
        };
      }
      return { kind: "inline", content: "[file]" };
    },
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  editor.blocks.updateBlock(block.id, { content: "edited" });
  finish!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(statuses.get("1")?.error).toBe("Destination changed");
  statuses.get("1")!.retry();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(destinations).toEqual(["block", "inline"]);
  expect(editor.blocks.getBlock(block.id)?.content).toBe("edited[file]");
  await panel.editor.destroy();
  await editor.destroy();
});

test("stores files with document context, validated URI, and bounded progress", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const { statuses, feedback } = feedbackStore();
  statuses.set("upload", { id: "upload", name: "note.txt", x: 0, y: 0, retry: () => {} });
  const writes: Array<{
    documentId: string;
    mode: string;
    name: string;
    source: string;
    destination: string;
  }> = [];
  const ingestion = new FileIngestion(feedback);
  const file = new File(["hello"], "note.txt", { type: "text/plain" });
  const uri = await ingestion.storeFile(
    {
      write: async (_file, context) => {
        writes.push(context);
        context.reportProgress?.(-1);
        expect(statuses.get("upload")).toMatchObject({ progress: 0 });
        context.reportProgress?.(2);
        return "test:note";
      },
      read: async () => undefined,
    },
    file,
    {
      panel,
      destination: "element",
      mode: panel.getSurfaceType(),
      source: "drop",
      statusId: "upload",
      name: "note.txt",
    },
  );
  expect(uri).toBe("test:note");
  expect(writes).toEqual([
    expect.objectContaining({
      documentId: editor.getDocument().id,
      mode: panel.getSurfaceType(),
      name: "note.txt",
      mimeType: "text/plain",
      source: "drop",
      destination: "element",
    }),
  ]);
  expect(statuses.get("upload")).toMatchObject({ progress: 1 });
  await panel.editor.destroy();
  await editor.destroy();
});

test("inserts an inline file at the captured range and moves the caret after it", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const block = editor.blocks.insertBlock({ type: "paragraph", content: "before after" });
  const { feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "inline", blockId: block.id, start: 7, end: 12, content: "before after" },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async () => ({ kind: "inline", content: "[file]" }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(editor.blocks.getBlock(block.id)?.content).toBe("before [file]");
  expect(panel.selection.get()).toMatchObject({
    type: "selection",
    blocks: [{ id: block.id, start: 13, end: 13 }],
    anchorBlockId: block.id,
    focusBlockId: block.id,
  });
  await panel.editor.destroy();
  await editor.destroy();
});

test("replaces an empty block with the first file and inserts later files in order", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  panel.editor.installDefaultWriting(paragraphBlockFactory);
  const original = editor.blocks.insertBlock({ type: "paragraph", content: "" });
  const { feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "block", afterId: original.id, replaceId: original.id, content: "" },
    items: ["first", "second"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async (name) => ({
      kind: "block",
      type: "file",
      props: { uri: `test:${name}`, name, mimeType: "text/plain" },
    }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const blocks = editor.blocks.getBlocks();
  expect(blocks.map((block) => [block.type, block.props.name])).toEqual([
    ["file", "first"],
    ["file", "second"],
  ]);
  expect(blocks[0]?.id).toBe(original.id);
  await panel.editor.destroy();
  await editor.destroy();
});

test("places canvas files diagonally above existing elements", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  panel.elements.insertElement({
    type: "file",
    frame: { x: 0, y: 0, width: 40, height: 40 },
    zIndex: 7,
    props: { uri: "test:existing", name: "existing", mimeType: "text/plain" },
  });
  const { feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 100, y: 200 },
    items: ["first", "second"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async (name) => preparedFile(name),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const elements = panel.elements
    .getElements()
    .filter((element) => element.props.name !== "existing");
  expect(elements.map((element) => [element.frame.x, element.frame.y, element.zIndex])).toEqual([
    [100, 200, 8],
    [124, 224, 9],
  ]);
  await panel.editor.destroy();
  await editor.destroy();
});

test("keeps insertion errors retryable when no error callback is supplied", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { statuses, feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async () => ({ kind: "inline", content: "file" }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(statuses.get("1")?.error).toContain("does not match");
  expect(panel.elements.getElements()).toHaveLength(0);
  await panel.editor.destroy();
  await editor.destroy();
});

test("does not start a batch after the owning extension is destroyed", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const { statuses, feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  let prepared = false;
  ingestion.destroy();
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async (name) => {
      prepared = true;
      return preparedFile(name);
    },
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(prepared).toBe(false);
  expect(statuses.size).toBe(0);
  expect(panel.elements.getElements()).toHaveLength(0);
  await panel.editor.destroy();
  await editor.destroy();
});

test("ignores provider progress after destruction", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const { statuses, feedback } = feedbackStore();
  statuses.set("upload", { id: "upload", name: "note.txt", x: 0, y: 0, retry: () => {} });
  let reportProgress: ((progress: number) => void) | undefined;
  let finishWrite: ((uri: string) => void) | undefined;
  const pending = new Promise<string>((resolve) => {
    finishWrite = resolve;
  });
  const ingestion = new FileIngestion(feedback);
  try {
    const result = ingestion.storeFile(
      {
        write: async (_content, context) => {
          reportProgress = context.reportProgress;
          return pending;
        },
        read: async () => undefined,
      },
      new File(["hello"], "note.txt", { type: "text/plain" }),
      {
        panel,
        destination: "element",
        mode: panel.getSurfaceType(),
        source: "drop",
        statusId: "upload",
        name: "note.txt",
      },
    );
    expect(reportProgress).toBeDefined();
    ingestion.destroy();
    reportProgress!(0.5);
    finishWrite!("test:file");
    await expect(result).rejects.toBeDefined();
    expect(statuses.get("upload")).not.toHaveProperty("progress");
  } finally {
    await panel.editor.destroy();
    await editor.destroy();
  }
});

test("does not report preparation failures after destruction", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const { statuses, feedback } = feedbackStore();
  const errors: unknown[] = [];
  let rejectPreparation: ((reason: Error) => void) | undefined;
  const pending = new Promise<ReturnType<typeof preparedFile>>((_resolve, reject) => {
    rejectPreparation = reject;
  });
  const ingestion = new FileIngestion(feedback, (error) => errors.push(error));
  try {
    ingestion.ingest({
      panel,
      destination: { kind: "element", x: 0, y: 0 },
      items: ["file"],
      point: { x: 0, y: 0 },
      name: (item) => item,
      prepare: () => pending,
      failureMessage: "Unable to upload",
      staleMessage: "Destination changed",
    });
    ingestion.destroy();
    rejectPreparation!(new Error("cancelled"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(statuses.get("1")).not.toHaveProperty("error");
    expect(errors).toEqual([]);
    expect(panel.elements.getElements()).toHaveLength(0);
  } finally {
    await panel.editor.destroy();
    await editor.destroy();
  }
});
