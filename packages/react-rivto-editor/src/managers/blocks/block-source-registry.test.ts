import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ChildrenPanel } from "@chulane/rivto";

it("owns dynamic source registration and rejects ambiguous block locations", async () => {
  const core = await createTestCoreEditor();
  const { editor } = createTestReactEditor({ editor: core });
  const events: number[] = [];
  const listeners = new Set<() => void>();
  const unsubscribe = editor.blockSources.subscribe(() =>
    events.push(editor.blockSources.revision),
  );
  const first = {
    id: "test.first",
    find: (id: string) => (id === "block" ? "collection" : undefined),
    has: (id: string) => id === "collection",
    hasBlock: (collectionId: string, blockId: string) =>
      collectionId === "collection" && blockId === "block",
    subscribe: (_collectionId: string, listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    createPanel: () => undefined,
  };
  const release = editor.blockSources.register(first);
  expect(editor.blockSources.find("block")).toEqual({
    sourceId: "test.first",
    collectionId: "collection",
  });
  expect(editor.blockSources.has({ sourceId: "test.first", collectionId: "collection" })).toBe(
    true,
  );
  expect(
    editor.blockSources.hasBlock({ sourceId: "test.first", collectionId: "collection" }, "block"),
  ).toBe(true);
  let changes = 0;
  const stopCollection = editor.blockSources.subscribeCollection(
    { sourceId: "test.first", collectionId: "collection" },
    () => {
      changes += 1;
    },
  );
  listeners.forEach((listener) => listener());
  expect(changes).toBe(1);
  stopCollection();
  expect(listeners.size).toBe(0);
  expect(() => editor.blockSources.register(first)).toThrow("already registered");
  first.id = "changed-after-registration";
  expect(editor.blockSources.find("block")?.sourceId).toBe("test.first");
  const releaseSecond = editor.blockSources.register({ ...first, id: "test.second" });
  expect(editor.blockSources.find("block")).toBeUndefined();
  releaseSecond();
  expect(editor.blockSources.find("block")?.sourceId).toBe("test.first");
  release();
  release();
  expect(editor.blockSources.find("block")).toBeUndefined();
  expect(events).toHaveLength(4);
  unsubscribe();
  await editor.destroy();
  await core.destroy();
});

it("rolls back a source when its registration notification fails", async () => {
  const core = await createTestCoreEditor();
  const { editor } = createTestReactEditor({ editor: core });
  const stop = editor.blockSources.subscribe(() => {
    throw new Error("Observer failed");
  });
  const source = {
    id: "test.failed",
    find: () => "collection",
    has: () => true,
    hasBlock: () => true,
    subscribe: () => () => {},
    createPanel: () => undefined,
  };
  expect(() => editor.blockSources.register(source)).toThrow();
  stop();
  expect(editor.blockSources.find("block")).toBeUndefined();
  const release = editor.blockSources.register(source);
  expect(editor.blockSources.find("block")?.sourceId).toBe("test.failed");
  release();
  await editor.destroy();
  await core.destroy();
});

it("rejects a source panel that does not protect the referenced root", async () => {
  const core = await createTestCoreEditor();
  const { editor } = createTestReactEditor({ editor: core });
  core.blocks.insertBlock({ id: "target", type: "paragraph" });
  editor.blockSources.register({
    id: "test.unprotected",
    find: () => "collection",
    has: () => true,
    hasBlock: () => true,
    subscribe: () => () => {},
    createPanel: () => new ChildrenPanel(core),
  });
  expect(() =>
    editor.blockSources.createPanel(
      { sourceId: "test.unprotected", collectionId: "collection" },
      "target",
    ),
  ).toThrow("protected reference root");
  await editor.destroy();
  await core.destroy();
});
