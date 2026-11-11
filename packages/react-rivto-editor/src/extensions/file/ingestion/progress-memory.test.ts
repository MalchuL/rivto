import { FileIngestion } from "./file-ingestion";
import { FileUploadStatusStore } from "./file-upload-status";
import type { FileIngestionPanel, FileUploadContext } from "./types";

/** Node's optional explicit garbage collector for this retention test. */
interface GarbageCollectionGlobal {
  gc?: () => void;
}

/** Progress callback and weak panel reference retained after a completed upload. */
interface ProgressRetention {
  readonly panel: WeakRef<object>;
  readonly progress: (value: number) => void;
}

/**
 * Creates feedback callbacks outside the host's lexical scope.
 *
 * @returns An inert status store for retention tests.
 */
function emptyStatuses(): ConstructorParameters<typeof FileIngestion>[0] {
  return { set: () => {}, update: () => {}, delete: () => {}, clear: () => {} };
}

/**
 * Completes an upload while retaining the callback a host may keep afterward.
 *
 * @returns The host callback and a weak reference to the former panel.
 */
async function retainProgress(): Promise<ProgressRetention> {
  const ingestion = new FileIngestion({
    set: () => {},
    update: () => {},
    delete: () => {},
    clear: () => {},
  });
  const panel = { editor: { getDocument: () => ({ id: "document" }) } };
  const reference = new WeakRef(panel);
  let progress: ((value: number) => void) | undefined;
  await ingestion.storeFile(
    {
      write: async (_file, context) => {
        progress = context.reportProgress;
        return "test:file";
      },
      read: async () => undefined,
    },
    new File(["data"], "file.txt"),
    { panel, statusId: "1", name: "file.txt" } as FileUploadContext,
  );
  ingestion.destroy();
  return { panel: reference, progress: progress! };
}

const gc = (globalThis as unknown as GarbageCollectionGlobal).gc;
const gcTest = gc ? test : test.skip;

gcTest("a retained upload progress callback does not retain its former panel", async () => {
  const retained = await retainProgress();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.panel.deref()).toBeUndefined();
  expect(retained.progress).toBeDefined();
});

/**
 * Completes an upload with an extension error callback.
 *
 * @returns A weak error callback reference and the progress callback retained by the provider.
 */
async function retainProgressWithErrorCallback(): Promise<{
  errorCallback: WeakRef<() => void>;
  progress: (value: number) => void;
}> {
  const panel = { editor: { getDocument: () => ({ id: "document" }) } };
  const onError = () => {};
  const reference = new WeakRef(onError);
  const ingestion = new FileIngestion(emptyStatuses(), onError);
  let progress!: (value: number) => void;
  await ingestion.storeFile(
    {
      write: async (_file, context) => {
        progress = context.reportProgress!;
        return "test:file";
      },
      read: async () => undefined,
    },
    new File(["data"], "file.txt"),
    { panel, statusId: "1", name: "file.txt" } as FileUploadContext,
  );
  ingestion.destroy();
  return { errorCallback: reference, progress };
}

gcTest("a retained progress callback releases the extension error callback", async () => {
  const retained = await retainProgressWithErrorCallback();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.errorCallback.deref()).toBeUndefined();
  retained.progress(0.5);
});
/** Pending provider operation retained independently of the cancelled ingestion. */
interface PendingRetention extends ProgressRetention {
  readonly finishWrite: (value: string) => void;
  readonly state: { settled: boolean };
}
/**
 * Cancels an upload while its provider retains an unresolved write.
 *
 * @returns Retained provider callbacks and a weak reference to the former panel.
 */
function retainPendingWrite(): PendingRetention {
  const ingestion = new FileIngestion({
    set: () => {},
    update: () => {},
    delete: () => {},
    clear: () => {},
  });
  const panel = { editor: { getDocument: () => ({ id: "document" }) } };
  const reference = new WeakRef(panel);
  const state = { settled: false };
  let progress: ((value: number) => void) | undefined;
  let finishWrite: ((value: string) => void) | undefined;
  const operation = ingestion.storeFile(
    {
      write: (_file, context) => {
        progress = context.reportProgress;
        return new Promise((resolve) => {
          finishWrite = resolve;
        });
      },
      read: async () => undefined,
    },
    new File(["data"], "file.txt"),
    { panel, statusId: "1", name: "file.txt" } as FileUploadContext,
  );
  void operation.catch(() => {
    state.settled = true;
  });
  ingestion.destroy();
  return { panel: reference, progress: progress!, finishWrite: finishWrite!, state };
}

gcTest("cancellation releases the panel while a provider write remains pending", async () => {
  const retained = retainPendingWrite();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.panel.deref()).toBeUndefined();
  expect(retained.state.settled).toBe(true);
  retained.finishWrite("test:file");
});
/** Provider callbacks retained independently of a cancelled upload batch. */
interface BatchRetention extends ProgressRetention {
  readonly finishWrite: (value: string) => void;
}
/**
 * Starts and cancels a batch whose provider never finishes its write.
 *
 * @returns The retained provider callbacks and a weak reference to the receiving panel.
 */
function retainPendingBatch(): BatchRetention {
  const ingestion = new FileIngestion(new FileUploadStatusStore());
  const panel = { editor: { getDocument: () => ({ id: "document" }) } };
  const reference = new WeakRef(panel);
  let progress: ((value: number) => void) | undefined;
  let finishWrite: ((value: string) => void) | undefined;
  const provider = {
    write: (_file: File, context: { reportProgress?: (value: number) => void }) => {
      progress = context.reportProgress;
      return new Promise<string>((resolve) => {
        finishWrite = resolve;
      });
    },
    read: async () => undefined,
  };
  ingestion.ingest({
    panel: panel as unknown as FileIngestionPanel,
    destination: { kind: "element", x: 0, y: 0 },
    items: [new File(["data"], "file.txt")],
    point: { x: 0, y: 0 },
    name: (file) => file.name,
    prepare: async (file, statusId) => ({
      kind: "element",
      type: "file",
      width: 100,
      height: 100,
      props: {
        uri: await ingestion.storeFile(provider, file, {
          panel,
          statusId,
          name: file.name,
        } as FileUploadContext),
      },
    }),
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  ingestion.destroy();
  return { panel: reference, progress: progress!, finishWrite: finishWrite! };
}

gcTest("cancellation releases an entire pending upload batch", async () => {
  const retained = retainPendingBatch();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.panel.deref()).toBeUndefined();
  retained.finishWrite("test:file");
});
