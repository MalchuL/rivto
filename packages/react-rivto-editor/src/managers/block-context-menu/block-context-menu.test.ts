import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { blockMenuTargets, executeBlockMenuEntry } from "./targets";
import { standardPreset } from "../../extensions/built-ins/built-ins";
import { todoItemExtension } from "../../extensions/todo-item/todo-item";

/**
 * Creates nested targets under the actual standard extension registrations.
 *
 * @returns Core and React panel runtimes, a parent/child subtree, and an unrelated
 * root. The test owns destruction of both runtimes after its assertions.
 */
async function fixture() {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [standardPreset(), todoItemExtension()],
  });
  const parent = core.blocks.insertBlock({
    type: "paragraph",
    content: "Parent",
    children: [
      { type: "paragraph", content: "Child", children: [{ type: "paragraph", content: "Leaf" }] },
    ],
  });
  const other = core.blocks.insertBlock({ type: "paragraph", content: "Other" });
  return { core, panel, parent, child: parent.children[0]!, other };
}

test("preserves selected groups, excludes covered roots, and retargets an outside handle", async () => {
  const f = await fixture();
  f.panel.selection.set(createStructuralSelection([f.parent.id, f.child.id]));
  expect(blockMenuTargets(f.panel, f.child.id)).toMatchObject({
    blockIds: [f.parent.id, f.child.id],
    rootIds: [f.parent.id],
  });
  expect(blockMenuTargets(f.panel, f.other.id).blockIds).toEqual([f.other.id]);
  f.panel.editor.destroy();
  await f.core.destroy();
});

test("recursive collapse includes hidden descendants and expands in one undo step", async () => {
  const f = await fixture();
  const context = blockMenuTargets(f.panel, f.parent.id);
  f.core.history.stopCapturing();
  await executeBlockMenuEntry("block.collapse", context);
  expect(f.core.blocks.getBlockNode(f.child.id)?.listProps.collapsed).toBe(true);
  f.core.history.stopCapturing();
  await executeBlockMenuEntry("block.expand", context);
  expect(f.core.blocks.getBlockNode(f.parent.id)?.listProps.collapsed).toBe(false);
  expect(f.core.blocks.getBlockNode(f.child.id)?.listProps.collapsed).toBe(false);
  f.core.history.undo();
  expect(f.core.blocks.getBlockNode(f.parent.id)?.listProps.collapsed).toBe(true);
  expect(f.core.blocks.getBlockNode(f.child.id)?.listProps.collapsed).toBe(true);
  f.panel.editor.destroy();
  await f.core.destroy();
});

test("multi-block list and todo conversion preserve identity, descendants, and colors", async () => {
  const f = await fixture();
  f.panel.blocks.updateBlock(f.parent.id, { listProps: { backgroundColor: "blue" } });
  f.panel.selection.set(createStructuralSelection([f.parent.id, f.other.id]));
  const context = blockMenuTargets(f.panel, f.parent.id);
  await executeBlockMenuEntry("list.checkbox", context);
  await executeBlockMenuEntry("type.todo-item", context);
  const parent = f.core.blocks.getBlock(f.parent.id)!;
  expect(parent.type).toBe("todo-item");
  expect(parent.content).toBe("Parent");
  expect(parent.children[0]?.id).toBe(f.child.id);
  expect(parent.listProps).toMatchObject({ backgroundColor: "blue", type: "checkbox" });
  const bundle = f.panel.clipboard.copy(createStructuralSelection([f.parent.id]))!;
  expect(bundle.blocks[0]?.listProps.backgroundColor).toBe("blue");
  expect(
    f.core.dump().blocks.find((block) => block.id === f.parent.id)?.listProps.backgroundColor,
  ).toBe("blue");
  expect(() =>
    f.panel.blocks.updateBlock(f.parent.id, { listProps: { backgroundColor: "invalid" } }),
  ).toThrow();
  f.panel.editor.destroy();
  await f.core.destroy();
});

test("registration cleanup and stale targets prevent execution", async () => {
  const f = await fixture();
  const registry = f.panel.editor.blockContextMenu;
  const context = blockMenuTargets(f.panel, f.parent.id);
  let calls = 0;
  const dispose = registry.register({
    id: "custom",
    title: "Custom",
    /**
     * Records execution so cleanup and stale-target checks can detect unwanted calls.
     *
     * @returns No value after incrementing the test-local invocation count.
     */
    execute: () => {
      calls++;
    },
  });
  await f.panel.blockContextMenu.execute("custom", context);
  expect(calls).toBe(1);
  dispose();
  dispose();
  await expect(executeBlockMenuEntry("custom", context)).rejects.toThrow("unavailable");
  f.panel.blocks.removeBlocks([f.parent.id]);
  await expect(executeBlockMenuEntry("list.checkbox", context)).rejects.toThrow(
    "no longer available",
  );
  f.panel.editor.destroy();
  await f.core.destroy();
});

test("execution waits for the action and propagates its asynchronous failure", async () => {
  const f = await fixture();
  try {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const failure = new Error("Clipboard write failed");
    f.panel.editor.blockContextMenu.register({
      id: "async-failure",
      title: "Async failure",
      /**
       * Defers failure until the test releases the simulated asynchronous operation.
       *
       * @returns A promise rejecting with the original failure after the gate opens.
       */
      execute: async () => {
        await gate;
        throw failure;
      },
    });
    let settled = false;
    const pending = f.panel.blockContextMenu.execute(
      "async-failure",
      blockMenuTargets(f.panel, f.parent.id),
    );
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await expect(pending).rejects.toBe(failure);
  } finally {
    f.panel.editor.destroy();
    await f.core.destroy();
  }
});
