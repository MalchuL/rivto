import { AttachmentManager } from "./attachment-manager";

/** Node's optional explicit garbage collector. */
interface GarbageCollectionGlobal {
  /**
   * Requests explicit garbage collection when Node exposes it.
   *
   * @returns A collection pass has been requested.
   */
  gc?: () => void;
}

/** Provider state retained independently of the cancelled attachment read. */
interface PendingReadRetention {
  readonly editor: WeakRef<object>;
  /**
   * Resolves the provider's retained read.
   *
   * @param value - Blob returned to the pending read.
   * @returns The pending provider promise is resolved.
   */
  readonly finish: (value: Blob) => void;
  readonly state: { cancelled: boolean };
}

/**
 * Starts and cancels a read while its provider keeps the read unresolved.
 *
 * @returns A weak editor reference and the provider's retained completion callback.
 */
function retainPendingRead(): PendingReadRetention {
  const editor = { getDocument: () => ({ id: "document" }) };
  const reference = new WeakRef(editor);
  const registrations = {
    assertActive: () => {},
    registerCleanup: (cleanup: () => void) => cleanup,
  };
  const manager = new AttachmentManager(
    editor as unknown as ConstructorParameters<typeof AttachmentManager>[0],
    registrations,
  );
  const controller = new AbortController();
  let finish: ((value: Blob) => void) | undefined;
  const state = { cancelled: false };
  const operation = manager.resolveBinary(
    {
      write: async () => "test:file",
      read: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    "test:file",
    { signal: controller.signal },
  );
  void operation.catch(() => {
    state.cancelled = true;
  });
  controller.abort();
  return { editor: reference, finish: finish!, state };
}

const gc = (globalThis as unknown as GarbageCollectionGlobal).gc;
const gcTest = gc ? test : test.skip;

gcTest("cancelling a pending provider read releases its former editor", async () => {
  const retained = retainPendingRead();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.state.cancelled).toBe(true);
  expect(retained.editor.deref()).toBeUndefined();
  retained.finish(new Blob(["late"]));
});

/** Pending opener retained independently of the cancelled attachment request. */
interface PendingOpenRetention {
  readonly editor: WeakRef<object>;
  /**
   * Resolves the host's retained opener operation.
   *
   * @returns The pending opener promise is resolved.
   */
  readonly finish: () => void;
  readonly state: { cancelled: boolean };
}

/**
 * Cancels a file-opening request while its host keeps the operation pending.
 *
 * @returns A weak editor reference and the host's retained completion callback.
 */
function retainPendingOpen(): PendingOpenRetention {
  const editor = { getDocument: () => ({ id: "document" }) };
  const reference = new WeakRef(editor);
  const registrations = {
    assertActive: () => {},
    registerCleanup: (cleanup: () => void) => cleanup,
  };
  const manager = new AttachmentManager(
    editor as unknown as ConstructorParameters<typeof AttachmentManager>[0],
    registrations,
  );
  const controller = new AbortController();
  const state = { cancelled: false };
  let finish: (() => void) | undefined;
  manager.registerFileOpenHandler({
    id: "pending",
    matches: () => true,
    open: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const operation = manager.openBinary(
    { write: async () => "test:file", read: async () => undefined },
    { uri: "test:file", name: "file", mimeType: "text/plain" },
    { signal: controller.signal },
  );
  void operation.catch(() => {
    state.cancelled = true;
  });
  controller.abort();
  return { editor: reference, finish: finish!, state };
}

gcTest("cancelling a pending host opener releases its former editor", async () => {
  const retained = retainPendingOpen();
  for (let index = 0; index < 8; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
  }
  expect(retained.editor.deref()).toBeUndefined();
  expect(retained.state.cancelled).toBe(true);
  retained.finish();
});
