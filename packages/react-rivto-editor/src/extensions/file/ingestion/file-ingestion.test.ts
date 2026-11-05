import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { paragraphBlockFactory } from "../../../block-factories";
import { fileExtension } from "../file";
import { kanbanExtension } from "../../containers/kanban/kanban";
import { FileIngestion } from "./file-ingestion";
import type { FileIngestionStatus, FileIngestionStatuses } from "./types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

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
    // Keep the current status available for assertions.
    set: (status) => {
      statuses.set(status.id, status);
    },
    // Apply progress and failure changes to the stored status.
    update: (id, patch) => {
      Object.assign(statuses.get(id)!, patch);
    },
    // Remove finished or retried statuses.
    delete: (id) => {
      statuses.delete(id);
    },
  };
  return { statuses, feedback };
}

// Supply a stable stored reference without claiming unrelated reads.
const provider = { write: async () => "test:file", read: async () => undefined };

test("inserts successful jobs in source order and retries a failed job", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { statuses, feedback } = feedbackStore();
  let finishFirst: ((value: ReturnType<typeof preparedFile>) => void) | undefined;
  // Keep the first input pending while later preparations complete.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Fail the middle input once so its status can be retried independently.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Return the wrong representation to exercise insertion failure feedback.
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

test("refuses a file block when the receiving block rejects its type", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const parent = panel.blocks.insertBlock({ type: "paragraph" }, { root: true });
  const { statuses, feedback } = feedbackStore();
  const permission = jestApi.spyOn(panel.editor.blockBehaviors, "canMove").mockReturnValue(false);
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "block", placement: { kind: "inside", parentId: parent.id } },
    items: ["file"],
    point: { x: 0, y: 0 },
    name: (item) => item,
    prepare: async () => ({ kind: "block", type: "file", props: { uri: "test:file" } }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(permission).toHaveBeenCalledWith(
    expect.objectContaining({
      destination: { parentId: parent.id, beforeId: undefined },
      sources: [expect.objectContaining({ type: "file", props: { uri: "test:file" } })],
    }),
  );
  expect(panel.blocks.getChildIds(parent.id)).toEqual([]);
  expect(statuses.get("1")?.error).toContain("cannot be inserted");
  await panel.editor.destroy();
  await editor.destroy();
});

test("rejects files in a Kanban board but accepts them in a column", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor,
    extensions: [kanbanExtension(), fileExtension({ provider })],
  });
  const board = panel.blocks.insertBlock({ type: "kanban" }, { root: true });
  const column = panel.blocks.insertBlock({ type: "kanban-column" }, { parentId: board.id });
  const { statuses, feedback } = feedbackStore();
  const ingestion = new FileIngestion(feedback);
  for (const parentId of [board.id, column.id]) {
    ingestion.ingest({
      panel,
      destination: { kind: "block", placement: { kind: "inside", parentId } },
      items: ["file"],
      point: { x: 0, y: 0 },
      name: (item) => item,
      prepare: async () => ({ kind: "block", type: "file", props: { uri: "test:file" } }),
      failureMessage: "Unable to upload",
      staleMessage: "Destination changed",
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(panel.blocks.getChildIds(board.id)).toEqual([column.id]);
  expect(statuses.get("2")?.error).toBeUndefined();
  expect(panel.blocks.getChildIds(column.id)).toHaveLength(1);
  expect(statuses.get("1")?.error).toContain("cannot be inserted");
  expect(statuses.has("2")).toBe(false);
  await panel.editor.destroy();
  await editor.destroy();
});

test("does not insert a prepared file after its extension is destroyed", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [fileExtension({ provider })] });
  const { feedback } = feedbackStore();
  let finish: ((value: ReturnType<typeof preparedFile>) => void) | undefined;
  // Allow preparation to finish after the ingestion owner has been destroyed.
  const pending = new Promise<ReturnType<typeof preparedFile>>((resolve) => {
    finish = resolve;
  });
  const ingestion = new FileIngestion(feedback);
  ingestion.ingest({
    panel,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["file"],
    point: { x: 0, y: 0 },
    // Use the input as the status card name.
    name: (item) => item,
    // Keep this preparation pending until the test destroys its owner.
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
  // Hold the original block preparation until its destination becomes stale.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Prepare a block first and an inline representation when the retry refreshes its destination.
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
  // Retry is unused while this status records provider progress.
  statuses.set("upload", { id: "upload", name: "note.txt", x: 0, y: 0, retry: () => {} });
  const writes: Array<{
    /** Document identity supplied to the provider. */
    documentId: string;
    /** File name supplied to the provider. */
    name: string;
  }> = [];
  const ingestion = new FileIngestion(feedback);
  const file = new File(["hello"], "note.txt", { type: "text/plain" });
  const uri = await ingestion.storeFile(
    {
      // Record the provider context and report progress outside both bounds.
      write: async (_file, context) => {
        writes.push(context);
        context.reportProgress?.(-1);
        expect(statuses.get("upload")).toMatchObject({ progress: 0 });
        context.reportProgress?.(2);
        return "test:note";
      },
      // Reading is unused in this storage-only case.
      read: async () => undefined,
    },
    file,
    {
      panel,
      statusId: "upload",
      name: "note.txt",
    },
  );
  expect(uri).toBe("test:note");
  expect(writes).toEqual([
    expect.objectContaining({
      documentId: editor.getDocument().id,
      name: "note.txt",
      mimeType: "text/plain",
    }),
  ]);
  expect(writes[0]).not.toHaveProperty("source");
  expect(writes[0]).not.toHaveProperty("destination");
  expect(writes[0]).not.toHaveProperty("mode");
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
    // Use the input as the status card name.
    name: (item) => item,
    // Return inline content for replacement of the captured range.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Produce a block for each input while retaining its name.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Prepare canvas files in the order supplied to the batch.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Return the wrong representation without installing an error callback.
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
    // Use the input as the status card name.
    name: (item) => item,
    // Record whether a destroyed ingestion instance incorrectly starts preparation.
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
  // Retry is unused while this status records late progress.
  statuses.set("upload", { id: "upload", name: "note.txt", x: 0, y: 0, retry: () => {} });
  let reportProgress: ((progress: number) => void) | undefined;
  let finishWrite: ((uri: string) => void) | undefined;
  // Hold the provider write until after the owner has been destroyed.
  const pending = new Promise<string>((resolve) => {
    finishWrite = resolve;
  });
  const ingestion = new FileIngestion(feedback);
  try {
    const result = ingestion.storeFile(
      {
        // Capture progress reporting and delay completion until the test releases it.
        write: async (_content, context) => {
          reportProgress = context.reportProgress;
          return pending;
        },
        // Reading is unused in this storage-only case.
        read: async () => undefined,
      },
      new File(["hello"], "note.txt", { type: "text/plain" }),
      {
        panel,
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
  // Reject preparation only after destruction to verify late failures are ignored.
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
      // Use the input as the status card name.
      name: (item) => item,
      // Reject this pending preparation after destruction.
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
