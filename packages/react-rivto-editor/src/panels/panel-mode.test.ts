import { ReactPanel } from "./react-panel";
import { ModeManager } from "@chulane/rivto";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { ChildrenPanel } from "@chulane/rivto";
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
it("connects a newly created panel and destroys it without a separate attach step", async () => {
  const core = await createTestCoreEditor();
  const runtime = createReactEditor({ editor: core });
  const editor = new ReactPanel(runtime, new ChildrenPanel(core));
  try {
    expect(editor.getSnapshot().retained).toBe(true);
    expect(editor).not.toHaveProperty("attachToEditor");
  } finally {
    editor.destroy();
    await runtime.destroy();
    await core.destroy();
  }
});
it("cleans up every retained registration even when one disposer throws", async () => {
  const core = await createTestCoreEditor();
  const runtime = createReactEditor({ editor: core });
  const release = jestApi.fn();
  jestApi.spyOn(runtime.blockElements, "maintainBlockCards").mockReturnValue(release);
  const panel = new ReactPanel(runtime, new ChildrenPanel(core));
  let released = 0;
  panel.registerCleanup(() => {
    throw new Error("Expected cleanup failure");
  });
  panel.registerCleanup(() => {
    released++;
  });
  expect(panel.destroy).toThrow("Expected cleanup failure");
  expect(release).toHaveBeenCalledTimes(1);
  expect(released).toBe(1);
  expect(panel.getSnapshot().api).toBeUndefined();
  expect(panel.destroy).not.toThrow();
  expect(release).toHaveBeenCalledTimes(1);
  await runtime.destroy();
  await core.destroy();
});
it("releases its projection when constructor subscription setup fails", async () => {
  const core = await createTestCoreEditor();
  const runtime = createReactEditor({ editor: core });
  const mode = new ModeManager();
  const release = jestApi.fn();
  let projectionAcquired = false;
  jestApi.spyOn(runtime.blockElements, "maintainBlockCards").mockImplementation(() => {
    projectionAcquired = true;
    return release;
  });
  jestApi.spyOn(mode, "subscribe").mockImplementation(() => {
    if (projectionAcquired) {
      throw new Error("Expected subscription failure");
    }
    return () => undefined;
  });
  expect(() => new ReactPanel(runtime, new ChildrenPanel(core), { mode })).toThrow(
    "Expected subscription failure",
  );
  expect(release).toHaveBeenCalledTimes(1);
  await runtime.destroy();
  await core.destroy();
});
it("separates undo captures across a mode change", async () => {
  const core = await createTestCoreEditor();
  const runtime = createReactEditor({ editor: core });
  const editor = new ReactPanel(runtime, new ChildrenPanel(core));
  const close = editor.destroy;
  const block = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });
  editor.document.history.clear();
  editor.blocks.updateBlock(block.id, { content: "Before switch" });
  editor.mode.set("edgeless");
  editor.blocks.updateBlock(block.id, { content: "After switch" });
  editor.document.history.undo();
  expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Before switch");
  editor.document.history.undo();
  expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Initial");
  expect(editor.mode.get()).toBe("edgeless");
  close();
  editor.editor.destroy();
  await core.destroy();
});

it("keeps mode local to panels and leaves persisted state unchanged", async () => {
  const core = await createTestCoreEditor();
  const shared = createReactEditor({ editor: core });
  const first = new ReactPanel(shared, new ChildrenPanel(shared, {}), {
    mode: new ModeManager("edgeless"),
  });
  const second = new ReactPanel(shared, new ChildrenPanel(shared, {}), {});
  const closeFirst = first.destroy;
  const closeSecond = second.destroy;
  first.blocks.insertBlock({ type: "paragraph", content: "Shared document" });
  const before = core.dump();
  const revision = core.revision;
  first.mode.set("block");
  expect(core.revision).toBe(revision);
  first.mode.set("edgeless");
  expect(second.mode.get()).toBe("block");
  expect(core.dump()).toEqual(before);
  closeFirst();
  closeSecond();
  shared.destroy();
  await core.destroy();
});
