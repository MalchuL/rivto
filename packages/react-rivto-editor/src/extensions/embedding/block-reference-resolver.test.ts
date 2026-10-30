import { EditorStorage } from "../../editor/editor-storage";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
const reference = { documentId: "source", blockId: "target" };

/**
 * Drains asynchronous reference lookups without advancing the fake clock.
 *
 * @returns Completion after queued lookup continuations have run.
 */
async function flushLookup(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await Promise.resolve();
  }
}

beforeEach(() => jestApi.useFakeTimers({ doNotFake: ["queueMicrotask"] }));
afterEach(() => jestApi.useRealTimers());

test.each(["error", "missing"])("reports the first %s without automatic retries", async (mode) => {
  const error = new Error("offline");
  const resolve = jestApi.fn(async () => {
    if (mode === "error") {
      throw error;
    }
    return { ambiguous: false };
  });
  const storage = new EditorStorage({ resolveBlock: resolve });
  const listener = jestApi.fn();
  storage.blockReferences.subscribeBlockLocation(reference, listener);
  await flushLookup();
  expect(listener).toHaveBeenCalledTimes(1);
  if (mode === "error") {
    expect(listener).toHaveBeenCalledWith({ ambiguous: false }, error);
  } else {
    expect(listener).toHaveBeenCalledWith({ documentId: undefined, ambiguous: false });
  }
  await jestApi.advanceTimersByTimeAsync(5000);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);
  await storage.destroy();
});

test("resolves once without loading candidate documents", async () => {
  const resolve = jestApi.fn(async () => ({ documentId: "source", ambiguous: false }));
  const open = jestApi.fn();
  const storage = new EditorStorage({ resolveBlock: resolve, openDocument: open });
  const listener = jestApi.fn();
  storage.blockReferences.subscribeBlockLocation(reference, listener);
  await flushLookup();
  expect(listener).toHaveBeenCalledWith({ documentId: "source", ambiguous: false });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  await storage.destroy();
});

test("unsubscribing ignores completion of a pending lookup", async () => {
  let finish!: (result: { documentId: string; ambiguous: boolean }) => void;
  const storage = new EditorStorage({
    resolveBlock: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const listener = jestApi.fn();
  const stop = storage.blockReferences.subscribeBlockLocation(reference, listener);
  await flushLookup();
  stop();
  finish({ documentId: "source", ambiguous: false });
  await flushLookup();
  expect(listener).not.toHaveBeenCalled();
  await storage.destroy();
});

test("registry changes still refresh a missing location", async () => {
  let notify!: () => void;
  let present = false;
  const resolve = jestApi.fn(async () => ({
    documentId: present ? "source" : undefined,
    ambiguous: false,
  }));
  const storage = new EditorStorage({
    resolveBlock: resolve,
    subscribeDocumentIds: (listener) => {
      notify = listener;
      return () => {};
    },
  });
  const listener = jestApi.fn();
  storage.blockReferences.subscribeBlockLocation(reference, listener);
  await flushLookup();
  present = true;
  notify();
  await flushLookup();
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenLastCalledWith({ documentId: "source", ambiguous: false });
  await storage.destroy();
});
