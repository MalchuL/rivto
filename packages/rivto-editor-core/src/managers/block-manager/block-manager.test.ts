/**
 * Verifies editor-owned outline policies against the generic document store.
 * Exercises page and edgeless runtimes, grouped movement, imports, and command
 * behavior without coupling those policies to document storage.
 */
import { createTestEditor, createStructuralSelection } from "../../editor/test-utils";

describe("block feature ownership independent of presentation", () => {
  it("preserves trailing blocks when the text survivor is stale", async () => {
    const editor = await createTestEditor();
    const block = editor.blocks.insertBlock({ type: "paragraph" });
    expect(() => editor.blocks.replaceTextSelection("missing", [block.id], "x")).toThrow();
    expect(editor.blocks.hasBlock(block.id)).toBe(true);
    await editor.destroy();
  });

  it("publishes direct text replacement once and restores the entire range with undo", async () => {
    const editor = await createTestEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "first" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "last" });
    editor.history.clear();
    const changes = jest.fn();
    const release = editor.subscribe(changes);
    editor.blocks.replaceTextSelection(first.id, [last.id], "combined");
    expect(changes).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlockNode(first.id)?.content).toBe("combined");
    expect(editor.blocks.hasBlock(last.id)).toBe(false);
    editor.history.undo();
    expect(editor.blocks.getBlocks()).toEqual([first, last]);
    release();
    await editor.destroy();
  });

  it("reports document removal and outdent eligibility", async () => {
    const editor = await createTestEditor();
    const root = editor.blocks.insertBlock({ type: "paragraph" });
    const child = editor.blocks.insertBlock({ type: "paragraph" }, { parentId: root.id });
    expect(editor.blocks.includeRoot).toBe(false);
    expect(editor.blocks.canRemove(root.id)).toBe(true);
    expect(editor.blocks.canRemove("missing")).toBe(false);
    expect(editor.blocks.canOutdent(root.id)).toBe(false);
    expect(editor.blocks.canOutdent(child.id)).toBe(true);
    expect(editor.blocks.canOutdent("missing")).toBe(false);
    await editor.destroy();
  });
  it("persists processor list-property changes on conversion as one undo step", async () => {
    const editor = await createTestEditor();
    editor.blockRegistry.defineBlock({ type: "tinted" });
    editor.blocks.registerProcessor({
      id: "tinted-processor",
      priority: 0,
      processor: (block) =>
        block.type === "tinted"
          ? { ...block, listProps: { ...block.listProps, processorFlag: "processed" } }
          : block,
    });
    const block = editor.blocks.insertBlock({ type: "paragraph" });
    editor.history.clear();
    editor.blocks.setBlockType(block.id, "tinted");
    expect(editor.blocks.getBlockNode(block.id)?.listProps.processorFlag).toBe("processed");
    editor.history.undo();
    expect(editor.blocks.getBlockNode(block.id)).toMatchObject({
      type: "paragraph",
      listProps: {},
    });
    editor.history.redo();
    expect(editor.blocks.getBlockNode(block.id)?.listProps.processorFlag).toBe("processed");
    editor.destroy();
  });

  it("orders selected IDs through their ancestors and follows moves and undo", async () => {
    const editor = await createTestEditor();
    editor.blocks.importForest([
      { id: "a", type: "paragraph", children: [{ id: "child", type: "paragraph" }] },
      { id: "b", type: "paragraph" },
      { id: "c", type: "paragraph" },
    ]);
    const forest = jest.spyOn(editor.runtime.blocks, "getBlocks");
    expect(editor.blocks.getOrderedIds(["b", "child", "a", "child", "missing"])).toEqual([
      "a",
      "child",
      "b",
    ]);
    editor.history.clear();
    editor.blocks.moveBlock("b", "a", "before");
    expect(editor.blocks.getOrderedIds(["child", "b", "a"])).toEqual(["b", "a", "child"]);
    editor.history.undo();
    expect(editor.blocks.getOrderedIds(["child", "b", "a"])).toEqual(["a", "child", "b"]);
    expect(forest).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("returns the complete block assembled during insertion", async () => {
    const editor = await createTestEditor();

    const inserted = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Root",
      children: [{ type: "paragraph", content: "Child" }],
    });

    expect(inserted).toMatchObject({
      type: "paragraph",
      content: "Root",
      children: [{ type: "paragraph", content: "Child" }],
    });
    editor.destroy();
  });

  it("returns lightweight identities after single and batch updates", async () => {
    const editor = await createTestEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "Child" }],
    });
    const second = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(first.id),
    );
    const getBlock = jest.spyOn(editor.runtime.blocks, "getBlock");

    const updated = editor.blocks.updateBlock(first.id, { content: "Updated" });
    const batch = editor.blocks.updateBlocks([
      { id: second.id, patch: { content: "Second updated" } },
      { id: first.id, patch: { props: { tone: "info" } } },
    ]);

    expect(updated).toMatchObject({ id: first.id, content: "Updated" });
    expect(updated).not.toHaveProperty("children");
    expect(batch).toMatchObject([
      { id: second.id, content: "Second updated" },
      { id: first.id, content: "Updated", props: { tone: "info" } },
    ]);
    expect(batch).not.toContainEqual(expect.objectContaining({ children: expect.anything() }));
    expect(getBlock).not.toHaveBeenCalled();
    getBlock.mockRestore();
    expect(editor.blocks.getBlockNode(first.id)).toMatchObject({
      content: "Updated",
      props: { tone: "info" },
    });
    editor.destroy();
  });

  it("owns recursive list-property preparation and validation in core", async () => {
    const editor = await createTestEditor();
    editor.blockListProps.register({
      id: "outline",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const rootId = editor.blocks.insertBlock({
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    }).id;
    expect(editor.blocks.getBlock(rootId)).toMatchObject({
      listProps: { collapsed: false },
      children: [{ id: "child", listProps: { collapsed: false } }],
    });
    expect(editor.blockListProps.validate({ collapsed: false })).toBeUndefined();
    expect(() => editor.blockListProps.validate({ collapsed: "yes" })).toThrow(
      "Invalid block list properties",
    );
    expect(() => editor.blocks.updateBlock(rootId, { listProps: { collapsed: "yes" } })).toThrow(
      "Invalid block list properties",
    );
    expect(() => editor.blocks.deleteListProps("missing", ["collapsed"])).toThrow(
      "Block missing not found",
    );
    expect(() =>
      editor.blocks.deleteListPropsBatch([
        { id: rootId, keys: ["collapsed"] },
        { id: "missing", keys: ["collapsed"] },
      ]),
    ).toThrow("Block missing not found");
    expect(editor.blocks.getBlockNode(rootId)?.listProps).toEqual({ collapsed: false });
    editor.destroy();
  });

  it("prepares definitions and processors recursively through one public pipeline", async () => {
    const editor = await createTestEditor();
    let sequence = 0;
    editor.blockRegistry.defineBlock({
      type: "prepared",
      defaultProps: () => ({ sequence: ++sequence }),
    });
    editor.blocks.registerProcessor({
      id: "test.prepared",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, processed: true } }),
    });

    const prepared = editor.blocks.prepareInput([
      {
        type: "prepared",
        children: [{ type: "prepared", props: { own: true } }],
      },
    ])[0]!;

    expect(prepared).toMatchObject({
      props: { sequence: 1, processed: true },
      children: [{ props: { sequence: 2, own: true, processed: true } }],
    });
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("rejects a cycle introduced by a creation processor before recursion overflows", async () => {
    const editor = await createTestEditor();
    editor.blocks.registerProcessor({
      id: "test.cyclic-children",
      priority: 0,
      processor: (block) => {
        const children: (typeof block)[] = [];
        const processed = { ...block, children };
        children.push(processed);
        return processed;
      },
    });

    expect(() => editor.blocks.prepareInput([{ type: "paragraph" }])).toThrow(
      "Block forest must be acyclic",
    );
    editor.destroy();
  });

  it("retries one failed block through the preparation error handler", async () => {
    const editor = await createTestEditor();
    const failures: string[] = [];
    const prepared = editor.blocks.prepareInput(
      [
        {
          type: "paragraph",
          children: [{ type: "missing", content: "Original" }],
        },
      ],
      (block, error) => {
        failures.push(`${block.type}:${error instanceof Error ? error.message : String(error)}`);
        return { type: "paragraph", content: "Replacement" };
      },
    );

    expect(prepared[0]?.children).toMatchObject([{ type: "paragraph", content: "Replacement" }]);
    expect(failures).toHaveLength(1);
    expect(() =>
      editor.blocks.prepareInput([{ type: "missing" }], () => ({ type: "still-missing" })),
    ).toThrow("Block type still-missing is not registered");
    editor.destroy();
  });

  it("prepares and validates a complete import before writing its first root", async () => {
    const editor = await createTestEditor();
    const complete = (id: string, type: string) => ({
      id,
      type,
      listProps: {},
      props: {},
      pluginData: {},
      content: id,
      children: [],
    });

    expect(() =>
      editor.blocks.importForest([complete("valid", "paragraph"), complete("invalid", "missing")]),
    ).toThrow("Block type missing is not registered");
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("keeps feature commands off document storage and merges through the editor", async () => {
    const editor = await createTestEditor();
    const target = editor.blocks.insertBlock({ type: "paragraph", content: "Hello " }).id;
    const source = editor.blocks.insertBlock({
      type: "paragraph",
      content: "world",
      children: [{ id: "child", type: "paragraph" }],
    }).id;
    editor.history.clear();
    const before = editor.dump();
    const exposesDocument: "document" extends keyof typeof editor ? true : false = false;
    expect(exposesDocument).toBe(false);
    expect(editor.blocks.mergeBlocks(target, source)).toBe(6);
    expect(editor.blocks.getBlockNode(target)?.content).toBe("Hello world");
    expect(editor.blocks.getBlockNode(target)?.childIds).toEqual(["child"]);
    editor.history.undo();
    expect(editor.dump()).toEqual(before);
    editor.destroy();
  });

  it("indents only the supplied ids even when other blocks are selected", async () => {
    const editor = await createTestEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock(
      { type: "paragraph", content: "First" },
      editor.blocks.getInsertionDestinationAfter(previousId),
    ).id;
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    editor.selection.set(createStructuralSelection([firstId, secondId], firstId, secondId));
    editor.blocks.indentBlock(firstId);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: previousId, children: [{ id: firstId }] },
      { id: secondId },
    ]);
    editor.destroy();
  });

  it("indents one block without reading unrelated siblings", async () => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: Array.from({ length: 128 }, (value, index) => ({
        id: `child-${index}`,
        type: "paragraph",
      })),
    });
    const getBlockNode = jest.spyOn(editor.runtime.blocks, "getBlockNode");

    editor.blocks.indentBlock("child-1");

    expect(editor.blocks.getParentId("child-1")).toBe("child-0");
    expect(getBlockNode.mock.calls.length).toBeLessThan(20);
    editor.destroy();
  });

  it("imports forests and reports stable source-to-destination identities", async () => {
    const editor = await createTestEditor();
    const root = editor.blocks.insertBlock({
      id: "source-root",
      type: "paragraph",
      children: [{ id: "source-child", type: "paragraph" }],
    }).id;
    const source = editor.blocks.getBlock(root)!;
    editor.blocks.removeBlock(root);

    const restored = editor.blocks.importForest([source]);
    expect([...restored.idMap]).toEqual([
      ["source-root", "source-root"],
      ["source-child", "source-child"],
    ]);

    const copied = editor.blocks.importForest([source]);
    const copiedRootId = copied.idMap.get("source-root");
    const copiedChildId = copied.idMap.get("source-child");
    expect(copied.roots.map(({ id }) => id)).toEqual([copiedRootId]);
    expect(copiedRootId).not.toBe("source-root");
    expect(copiedChildId).not.toBe("source-child");
    expect(copiedRootId).not.toBe(copiedChildId);
    editor.destroy();
  });

  it("imports ID-less inputs and returns complete persisted roots", async () => {
    const editor = await createTestEditor();
    const getBlock = jest.spyOn(editor.runtime.blocks, "getBlock");

    const imported = editor.blocks.importForest([
      {
        type: "paragraph",
        content: "Parsed externally",
        children: [{ type: "paragraph", content: "Child" }],
      },
    ]);

    expect(imported.idMap.size).toBe(0);
    expect(imported.roots).toMatchObject([
      {
        id: expect.any(String),
        type: "paragraph",
        content: "Parsed externally",
        children: [{ type: "paragraph", content: "Child" }],
      },
    ]);
    expect(getBlock).not.toHaveBeenCalled();
    getBlock.mockRestore();
    editor.destroy();
  });
});

test("imports with preallocated identities and runs processors once per block", async () => {
  const editor = await createTestEditor();
  const calls: string[] = [];
  const dispose = editor.blocks.registerProcessor({
    id: "prepare-once",
    priority: 0,
    processor: (block) => {
      calls.push(block.id!);
      return { ...block, content: `${block.content ?? ""}!` };
    },
  });
  const ids = new Map([
    ["parent", "new-parent"],
    ["child", "new-child"],
  ]);
  const result = editor.blocks.importForest(
    [
      {
        id: "parent",
        type: "paragraph",
        content: "parent",
        children: [{ id: "child", type: "paragraph", content: "child" }],
      },
    ],
    undefined,
    { ids },
  );
  expect(calls).toEqual(["new-parent", "new-child"]);
  expect(result.idMap).toBe(ids);
  expect(result.roots[0]).toMatchObject({
    id: "new-parent",
    content: "parent!",
    children: [{ id: "new-child", content: "child!" }],
  });
  dispose();
  await editor.destroy();
});

test("rejects an incomplete preallocated identity map before insertion", async () => {
  const editor = await createTestEditor();
  expect(() =>
    editor.blocks.importForest([{ id: "source", type: "paragraph" }], undefined, {
      ids: new Map(),
    }),
  ).toThrow("Missing imported block ID");
  expect(editor.blocks.getRootIds()).toEqual([]);
  await editor.destroy();
});

test("import recovery can replace a rejected subtree with a single error block", async () => {
  const editor = await createTestEditor();
  const imported = editor.blocks.importForest(
    [{ id: "invalid", type: "unknown", children: [{ id: "child", type: "paragraph" }] }],
    undefined,
    {
      onError: (block) => ({ type: "paragraph", content: "Recovered", props: { original: block } }),
    },
  );
  expect(imported.roots[0]).toMatchObject({
    id: imported.idMap.get("invalid"),
    content: "Recovered",
    children: [],
  });
  editor.destroy();
});

test("core structural behavior processes child creation and movement without React", async () => {
  const editor = await createTestEditor();
  try {
    const parent = editor.blocks.insertBlock({ type: "paragraph" });
    const events: string[] = [];
    const dispose = editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === parent.id,
      onChildEnter: ({ child }) => {
        events.push("enter");
        return { ...child, pluginData: { ...child.pluginData, active: true } };
      },
      onChildExit: ({ child }) => {
        events.push("exit");
        return { ...child, pluginData: { ...child.pluginData, active: false } };
      },
    });
    const child = editor.blocks.insertBlock({ type: "paragraph" }, { parentId: parent.id });
    expect(editor.blocks.getBlockNode(child.id)?.pluginData.active).toBe(true);
    editor.history.clear();
    editor.blocks.moveBlock(child.id, parent.id, "after");
    expect(events).toEqual(["enter", "exit"]);
    expect(editor.blocks.getBlockNode(child.id)?.pluginData.active).toBe(false);
    editor.history.undo();
    expect(editor.blocks.getParentId(child.id)).toBe(parent.id);
    expect(editor.blocks.getBlockNode(child.id)?.pluginData.active).toBe(true);
    dispose();
    dispose();
  } finally {
    editor.destroy();
  }
});

test("core movement policies inspect foreign sources and the resolved parent", async () => {
  const editor = await createTestEditor();
  try {
    const parent = editor.blocks.insertBlock({ type: "paragraph" });
    const source = editor.blocks.insertBlock({ type: "paragraph" });
    const calls: string[] = [];
    const dispose = editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === parent.id,
      canMove: ({ sources, parent: receiver }) => {
        calls.push(`${sources[0]?.id}:${receiver?.id}`);
        return sources[0]?.props.allowed === true;
      },
    });
    const foreign = {
      ...editor.blocks.getBlockNode(source.id)!,
      id: "foreign",
      props: { allowed: true },
    };
    expect(
      editor.blocks.canMove({
        sources: [foreign],
        destination: { parentId: parent.id },
      }),
    ).toBe(true);
    expect(calls).toEqual([`foreign:${parent.id}`]);
    expect(
      editor.blocks.canMove({
        sources: [{ ...foreign, props: {} }],
        destination: { parentId: parent.id },
      }),
    ).toBe(false);
    dispose();
    expect(
      editor.blocks.canMove({
        sources: [foreign],
        destination: { parentId: "missing" },
      }),
    ).toBe(false);
  } finally {
    editor.destroy();
  }
});

test("import preserves requested identities before writing any roots", async () => {
  const editor = await createTestEditor();
  try {
    const source = [
      { id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph" }] },
      { id: "sibling", type: "paragraph" },
    ];
    const dispose = editor.blocks.registerProcessor({
      id: "rewrite-import-id",
      priority: 0,
      processor: (block) => (block.id === "child" ? { ...block, id: "changed" } : block),
    });
    expect(() => editor.blocks.importForest(source, undefined, { preserveIds: true })).toThrow(
      "preserve block IDs",
    );
    expect(editor.blocks.getRootIds()).toEqual([]);
    dispose();
    editor.blocks.insertBlock({ id: "sibling", type: "paragraph" });
    expect(() => editor.blocks.importForest(source, undefined, { preserveIds: true })).toThrow(
      "Destination already contains block sibling",
    );
    expect(editor.blocks.getRootIds()).toEqual(["sibling"]);
    editor.blocks.removeBlock("sibling");
    editor.history.clear();
    const imported = editor.blocks.importForest(source, undefined, { preserveIds: true });
    expect(imported.roots.map(({ id }) => id)).toEqual(["parent", "sibling"]);
    expect(imported.roots[0]?.children[0]?.id).toBe("child");
    editor.history.undo();
    expect(editor.blocks.getRootIds()).toEqual([]);
  } finally {
    await editor.destroy();
  }
});

test.each(["mapping", "processor"])(
  "rejects swapped import identities from a %s",
  async (source) => {
    const editor = await createTestEditor();
    const ids = new Map([
      ["a", "b"],
      ["b", "a"],
    ]);
    try {
      if (source === "processor") {
        editor.blocks.registerProcessor({
          id: "swap-import-ids",
          priority: 0,
          processor: (block) => ({ ...block, id: ids.get(block.id!) }),
        });
      }
      const blocks = ["a", "b"].map((id) => ({ id, type: "paragraph", content: id }));
      expect(() =>
        editor.blocks.importForest(blocks, undefined, {
          preserveIds: true,
          ids: source === "mapping" ? ids : undefined,
        }),
      ).toThrow("preserve block IDs");
      expect(editor.blocks.getRootIds()).toEqual([]);
    } finally {
      await editor.destroy();
    }
  },
);

test("outline commands order selected roots once and preserve undo", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [
        { id: "first", type: "paragraph" },
        { id: "second", type: "paragraph" },
        { id: "third", type: "paragraph" },
        { id: "tail", type: "paragraph" },
      ],
    });
    const ordered = jest.spyOn(editor.blocks, "getOrderedIds");
    editor.history.clear();
    editor.blocks.indentBlocks(["third", "second"]);
    expect(ordered).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getChildIds("first")).toEqual(["second", "third"]);
    ordered.mockClear();
    editor.blocks.outdentBlocks(["third", "second"]);
    expect(ordered).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getChildIds("parent")).toEqual(["first", "second", "third", "tail"]);
    editor.history.undo();
    expect(editor.blocks.getChildIds("first")).toEqual(["second", "third"]);
  } finally {
    await editor.destroy();
  }
});

test.each([0, 200])(
  "outline commands avoid reading %i unrelated descendants",
  async (unrelatedCount) => {
    const editor = await createTestEditor();
    try {
      editor.blocks.insertBlock({
        id: "unrelated",
        type: "paragraph",
        children: Array.from({ length: unrelatedCount }, (_, index) => ({
          id: `unrelated-${index}`,
          type: "paragraph",
        })),
      });
      editor.blocks.insertBlock({
        id: "parent",
        type: "paragraph",
        children: [
          { id: "first", type: "paragraph" },
          { id: "second", type: "paragraph" },
          { id: "third", type: "paragraph" },
        ],
      });
      const reads = jest.spyOn(editor.runtime.blocks, "getBlockNode");
      editor.history.clear();
      editor.blocks.indentBlocks(["second", "third"]);
      expect(editor.blocks.getChildIds("first")).toEqual(["second", "third"]);
      expect(reads.mock.calls.some(([id]) => id.startsWith("unrelated-"))).toBe(false);
      reads.mockClear();
      editor.blocks.outdentBlocks(["second", "third"]);
      expect(editor.blocks.getChildIds("parent")).toEqual(["first", "second", "third"]);
      expect(reads.mock.calls.some(([id]) => id.startsWith("unrelated-"))).toBe(false);
      editor.history.undo();
      expect(editor.blocks.getChildIds("first")).toEqual(["second", "third"]);
    } finally {
      await editor.destroy();
    }
  },
);

test.each([false, true])(
  "outdent respects outline adjacency across parent boundaries when a gap is %s",
  async (hasGap) => {
    const editor = await createTestEditor();
    try {
      editor.blocks.insertBlock({
        id: "parent",
        type: "paragraph",
        children: [
          { id: "first", type: "paragraph" },
          { id: "last", type: "paragraph" },
          ...(hasGap ? [{ id: "gap", type: "paragraph" }] : []),
        ],
      });
      editor.blocks.insertBlock({ id: "next", type: "paragraph" });
      editor.history.clear();
      editor.blocks.outdentBlocks(["last", "next"]);
      expect(editor.blocks.getParentId("last")).toBe(hasGap ? "parent" : null);
      expect(editor.blocks.getRootIds()).toEqual(
        hasGap ? ["parent", "next"] : ["parent", "last", "next"],
      );
      if (!hasGap) {
        editor.history.undo();
        expect(editor.blocks.getParentId("last")).toBe("parent");
      }
    } finally {
      await editor.destroy();
    }
  },
);

test("ordering a large outline selection reads its sibling list a bounded number of times", async () => {
  const editor = await createTestEditor();
  try {
    const children = Array.from({ length: 41 }, (_, index) => ({
      id: `child-${index}`,
      type: "paragraph",
    }));
    editor.blocks.insertBlock({ id: "parent", type: "paragraph", children });
    const reads = jest.spyOn(editor.blocks, "getChildIds");
    const selected = children.slice(1).map(({ id }) => id);
    editor.history.clear();
    editor.blocks.indentBlocks(selected);
    expect(reads.mock.calls.filter(([id]) => id === "parent").length).toBeLessThanOrEqual(2);
    expect(editor.blocks.getChildIds("child-0")).toEqual(selected);
    editor.history.undo();
    expect(editor.blocks.getChildIds("parent")).toHaveLength(41);
  } finally {
    await editor.destroy();
  }
});
