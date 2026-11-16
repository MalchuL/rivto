import { type DocumentEditorAPI } from "@chulane/rivto";
import { createTestCoreEditor as createDocumentEditor } from "../../../test-utils";
import { transferBlocksBetweenDocuments } from "../../../block-transfer/cross-document-block-transfer";

async function createEditor(): Promise<DocumentEditorAPI> {
  const editor = await createDocumentEditor();
  editor.blockRegistry.defineBlock({ type: "test.counter", defaultProps: { count: 0 } });
  return editor;
}

describe("cross-document block transfer", () => {
  test("preserves selected subtree order and data", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    const first = source.blocks.insertBlock({
      id: "first",
      type: "paragraph",
      content: "First",
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    }).id;
    const second = source.blocks.insertBlock({
      id: "second",
      type: "paragraph",
      content: "Second",
    }).id;
    const outside = source.blocks.insertBlock({
      id: "outside",
      type: "paragraph",
      content: "Outside",
    }).id;
    const target = destination.blocks.insertBlock({
      id: "target",
      type: "paragraph",
      content: "Target",
    }).id;
    source.history.clear();
    destination.history.clear();

    transferBlocksBetweenDocuments(source, destination, [first, second], {
      targetId: target,
      position: "inside",
    });

    expect(source.blocks.getRootIds()).toEqual([outside]);
    expect(destination.blocks.getBlockNode(target)?.childIds).toEqual([first, second]);
    expect(destination.blocks.getBlock(first)).toMatchObject({
      id: first,
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });

    destination.history.undo();
    expect(destination.blocks.getRootIds()).toEqual([target]);
    expect(source.blocks.getRootIds()).toEqual([outside]);
    source.history.undo();
    expect(source.blocks.getRootIds()).toEqual([first, second, outside]);

    source.destroy();
    destination.destroy();
  });

  test("appends into an empty destination", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    source.blocks.insertBlock({ id: "moved", type: "paragraph", content: "Moved" });

    transferBlocksBetweenDocuments(source, destination, ["moved"], {
      targetId: null,
      position: "after",
    });

    expect(source.blocks.getBlocks()).toEqual([]);
    expect(destination.blocks.getRootIds()).toEqual(["moved"]);
    source.destroy();
    destination.destroy();
  });

  test("rejects a duplicate block ID without changing either document", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    source.blocks.insertBlock({
      id: "moved",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    destination.blocks.insertBlock({ id: "child", type: "paragraph" });
    const sourceBefore = source.dump();
    const destinationBefore = destination.dump();

    expect(() =>
      transferBlocksBetweenDocuments(source, destination, ["moved"], {
        targetId: null,
        position: "after",
      }),
    ).toThrow("Destination already contains block");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.dump()).toEqual(destinationBefore);
    source.destroy();
    destination.destroy();
  });

  test("validates destination definitions before changing either document", async () => {
    const source = await createEditor();
    const destination = await createDocumentEditor();
    source.blocks.insertBlock({ id: "custom", type: "test.counter", props: { count: 9 } });
    const sourceBefore = source.dump();

    expect(() =>
      transferBlocksBetweenDocuments(source, destination, ["custom"], {
        targetId: null,
        position: "after",
      }),
    ).toThrow("Block type test.counter is not registered");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.blocks.getBlocks()).toEqual([]);
    source.destroy();
    destination.destroy();
  });
});

test("transfers between two source models using one editor runtime", async () => {
  const { DocumentModelImpl } = await import("@chulane/document-model");
  const { YjsDoc } = await import("@chulane/crdt-doc");
  const editor = await createEditor();
  editor.blocks.insertBlock({ id: "host", type: "paragraph", content: "Host" });
  const source = new DocumentModelImpl(new YjsDoc(crypto.randomUUID()));
  const destination = new DocumentModelImpl(new YjsDoc(crypto.randomUUID()));
  source.blocks.insertBlock({ id: "moved", type: "paragraph", content: "Moved" });
  source.history.clear();
  destination.history.clear();
  const { createTestMultiEditor } = await import("../../../test-utils");
  const { createReactEditor } = await import("../../../editor/react-editor");
  const runtime = await createTestMultiEditor([source, destination]);
  transferBlocksBetweenDocuments(
    runtime.getEditor(source.id)!,
    runtime.getEditor(destination.id)!,
    ["moved"],
    { targetId: null, position: "after" },
  );
  expect(source.blocks.hasBlock("moved")).toBe(false);
  expect(destination.blocks.getBlockNode("moved")?.content).toBe("Moved");
  expect(editor.blocks.getRootIds()).toEqual(["host"]);
  destination.history.undo();
  source.history.undo();
  expect(source.blocks.getBlockNode("moved")?.content).toBe("Moved");
  expect(destination.blocks.getRootIds()).toEqual([]);
  await runtime.destroy();
  await editor.destroy();
});

test("rejects overlapping roots and processor-changed identities before writing either document", async () => {
  const source = await createEditor();
  const destination = await createEditor();
  source.blocks.insertBlock({
    id: "parent",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  const before = source.dump();
  expect(() =>
    transferBlocksBetweenDocuments(source, destination, ["parent", "child"], {
      targetId: null,
      position: "after",
    }),
  ).toThrow();
  expect(destination.blocks.getRootIds()).toEqual([]);
  const stop = destination.blocks.registerProcessor({
    id: "rewrite",
    priority: 0,
    processor: (block) => ({ ...block, id: `${block.id}-changed` }),
  });
  expect(() =>
    transferBlocksBetweenDocuments(source, destination, ["parent"], {
      targetId: null,
      position: "after",
    }),
  ).toThrow("preserve block IDs");
  expect(source.dump()).toEqual(before);
  expect(destination.blocks.getRootIds()).toEqual([]);
  stop();
  await source.destroy();
  await destination.destroy();
});

test("uses core panel access without requiring a React runtime and retains hidden roots", async () => {
  const { ChildrenPanel } = await import("@chulane/rivto");
  const source = await createEditor();
  const destination = await createEditor();
  source.blocks.insertBlock({
    id: "source-root",
    type: "paragraph",
    children: [{ id: "moved", type: "paragraph", content: "Moved" }],
  });
  destination.blocks.insertBlock({ id: "destination-root", type: "paragraph" });
  const sourcePanel = new ChildrenPanel(source, { rootBlockId: "source-root" });
  const destinationPanel = new ChildrenPanel(destination, { rootBlockId: "destination-root" });

  const sourceBefore = source.dump();
  const destinationBefore = destination.dump();
  try {
    expect(() =>
      transferBlocksBetweenDocuments(sourcePanel, destinationPanel, ["source-root"], {
        targetId: null,
        position: "after",
      }),
    ).toThrow("Source block is outside panel or protected");
    expect(() =>
      transferBlocksBetweenDocuments(sourcePanel, destinationPanel, ["moved"], {
        targetId: "destination-root",
        position: "before",
      }),
    ).toThrow("Destination is outside panel or protected");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.dump()).toEqual(destinationBefore);
    transferBlocksBetweenDocuments(sourcePanel, destinationPanel, ["moved"], {
      targetId: "destination-root",
      position: "inside",
    });
    expect(source.blocks.getBlockNode("source-root")?.childIds).toEqual([]);
    expect(destination.blocks.getBlockNode("destination-root")?.childIds).toEqual(["moved"]);
  } finally {
    source.destroy();
    destination.destroy();
  }
});

test("imports before source exit, so only destination entry changes are transferred", async () => {
  const source = await createEditor();
  const destination = await createEditor();
  try {
    source.blocks.insertBlock({
      id: "old-parent",
      type: "paragraph",
      children: [{ id: "moved", type: "paragraph", content: "text" }],
    });
    destination.blocks.insertBlock({ id: "new-parent", type: "paragraph" });
    const calls: string[] = [];
    source.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "old-parent",
      onChildExit: ({ child }) => {
        calls.push("exit");
        return { ...child, content: `${child.content}:exit` };
      },
    });
    destination.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "new-parent",
      onChildEnter: ({ child }) => {
        calls.push("enter");
        return { ...child, content: `${child.content}:enter` };
      },
    });
    transferBlocksBetweenDocuments(source, destination, ["moved"], {
      targetId: "new-parent",
      position: "inside",
    });
    expect(destination.blocks.getBlockNode("moved")?.content).toBe("text:enter");
    expect(calls).toEqual(["enter", "exit"]);
  } finally {
    await source.destroy();
    await destination.destroy();
  }
});

test("leaves both documents unchanged when a destination child-entry rule rejects transfer", async () => {
  const source = await createEditor();
  const destination = await createEditor();
  try {
    source.blocks.insertBlock({ id: "moved", type: "paragraph" });
    destination.blocks.insertBlock({ id: "parent", type: "paragraph" });
    destination.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "parent",
      onChildEnter: () => {
        throw new Error("entry rejected");
      },
    });
    const sourceBefore = source.dump();
    const destinationBefore = destination.dump();
    expect(() =>
      transferBlocksBetweenDocuments(source, destination, ["moved"], {
        targetId: "parent",
        position: "inside",
      }),
    ).toThrow("entry rejected");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.dump()).toEqual(destinationBefore);
  } finally {
    await source.destroy();
    await destination.destroy();
  }
});

test("rejects a forbidden cross-document move before either document changes", async () => {
  const source = await createEditor();
  const destination = await createEditor();
  try {
    source.blocks.insertBlock({ id: "moved", type: "paragraph" });
    destination.blocks.insertBlock({ id: "parent", type: "paragraph" });
    destination.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "parent",
      canMove: () => false,
    });
    const sourceBefore = source.dump();
    const destinationBefore = destination.dump();
    expect(() =>
      transferBlocksBetweenDocuments(source, destination, ["moved"], {
        targetId: "parent",
        position: "inside",
      }),
    ).toThrow("Block transfer is not permitted");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.dump()).toEqual(destinationBefore);
  } finally {
    await source.destroy();
    await destination.destroy();
  }
});

test("reports intercepted source removal after importing the destination copy", async () => {
  const source = await createEditor();
  const destination = await createEditor();
  try {
    source.blocks.insertBlock({ id: "moved", type: "paragraph" });
    source.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "moved",
      onStructuralDelete: () => "handled",
    });
    expect(() =>
      transferBlocksBetweenDocuments(source, destination, ["moved"], {
        targetId: null,
        position: "after",
      }),
    ).toThrow("Source block removal was intercepted after destination insertion");
    expect(source.blocks.hasBlock("moved")).toBe(true);
    expect(destination.blocks.hasBlock("moved")).toBe(true);
  } finally {
    await source.destroy();
    await destination.destroy();
  }
});
