/**
 * Regression coverage for granular block and element observation.
 *
 * Stable snapshots are the contract consumed by React's external-store hooks:
 * unrelated mutations retain identity while affected recursive values and
 * structural collections publish exactly where needed.
 */
import { YjsDoc } from "@chulane/crdt-doc";
import * as Y from "yjs";
import { DocumentModelImpl } from "../document-model";

describe("document reactivity", () => {
  test("checks child presence directly in stored records", () => {
    const doc = new YjsDoc("has-children-reactivity");
    const model = new DocumentModelImpl(doc);

    expect(model.blocks.hasChildren("missing")).toBe(false);
    doc.transact(() => {
      model.blocks.insertBlock({
        id: "parent",
        type: "paragraph",
        children: [{ id: "child", type: "paragraph" }],
      });
      expect(model.blocks.hasChildren("parent")).toBe(true);
      expect(model.blocks.hasChildren("child")).toBe(false);
    });
    expect(model.blocks.hasChildren("parent")).toBe(true);
    model.blocks.removeBlock("child");
    expect(model.blocks.hasChildren("parent")).toBe(false);
    void doc.destroy();
  });

  test("invalidates a changed block and its ancestors but preserves siblings", () => {
    const doc = new YjsDoc("block-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "before" }],
    });
    model.blocks.insertBlock({ id: "sibling", type: "paragraph" }, "parent");
    const parent = model.blocks.getBlock("parent");
    const sibling = model.blocks.getBlock("sibling");
    const roots = model.blocks.getRootIds();
    const calls = { parent: 0, child: 0, sibling: 0, roots: 0, structure: 0 };
    const disposers = [
      model.blocks.subscribeBlock("parent", () => { calls.parent += 1; }),
      model.blocks.subscribeBlock("child", () => { calls.child += 1; }),
      model.blocks.subscribeBlock("sibling", () => { calls.sibling += 1; }),
      model.blocks.subscribeRootIds(() => { calls.roots += 1; }),
      model.blocks.subscribeStructure(() => { calls.structure += 1; }),
    ];

    model.blocks.updateBlock("child", { content: "after" });

    expect(calls).toEqual({ parent: 1, child: 1, sibling: 0, roots: 0, structure: 0 });
    expect(model.blocks.getBlock("parent")).not.toBe(parent);
    expect(model.blocks.getBlock("parent")?.children[0]?.content).toBe("after");
    expect(model.blocks.getBlock("sibling")).toBe(sibling);
    expect(model.blocks.getRootIds()).toBe(roots);
    disposers.forEach((dispose) => dispose());
    void doc.destroy();
  });

  test("recursive snapshots share the cached child objects", () => {
    const doc = new YjsDoc("shared-recursive-snapshots");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{
        id: "child",
        type: "paragraph",
        children: [{ id: "grandchild", type: "paragraph" }],
      }],
    });

    const parent = model.blocks.getBlock("parent")!;
    const child = model.blocks.getBlock("child")!;
    expect(model.blocks.getBlock("parent")).toBe(parent);
    expect(parent.children[0]).toBe(child);
    expect(child.children[0]).toBe(model.blocks.getBlock("grandchild"));
    void doc.destroy();
  });

  test("separates hierarchy notifications from block property updates", () => {
    const doc = new YjsDoc("structure-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "parent", type: "paragraph" });
    model.blocks.insertBlock({ id: "child", type: "paragraph" }, "parent");
    let structure = 0;
    let roots = 0;
    model.blocks.subscribeStructure(() => { structure += 1; });
    model.blocks.subscribeRootIds(() => { roots += 1; });

    model.blocks.updateBlock("parent", { listProps: { checked: true } });
    expect({ structure, roots }).toEqual({ structure: 0, roots: 0 });

    model.blocks.moveBlock("child", "parent", "inside");
    expect(structure).toBe(1);
    expect(roots).toBe(1);
    void doc.destroy();
  });

  test("reorders roots without invalidating their block snapshots", () => {
    const doc = new YjsDoc("root-reorder-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "first", type: "paragraph" });
    model.blocks.insertBlock({ id: "second", type: "paragraph" }, "first");
    const first = model.blocks.getBlock("first");
    const second = model.blocks.getBlock("second");
    let blockChanges = 0;
    let rootChanges = 0;
    model.blocks.subscribeBlock("first", () => { blockChanges += 1; });
    model.blocks.subscribeBlock("second", () => { blockChanges += 1; });
    model.blocks.subscribeRootIds(() => { rootChanges += 1; });

    model.blocks.moveBlock("second", "first", "before");

    expect(model.blocks.getRootIds()).toEqual(["second", "first"]);
    expect(model.blocks.getBlock("first")).toBe(first);
    expect(model.blocks.getBlock("second")).toBe(second);
    expect({ blockChanges, rootChanges }).toEqual({ blockChanges: 0, rootChanges: 1 });
    void doc.destroy();
  });

  test("rebuilds duplicate placements in root tree order", () => {
    const doc = new YjsDoc("duplicate-placement-index");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    expect(model.blocks.getParentId("child")).toBe("parent");
    const roots = doc.doc.getArray<string>("rivto.editor.roots");
    // Keep this malformed local placement long enough to exercise the cache;
    // foreign writes are normalized by the document model after each update.
    doc.transact(() => roots.push(["child"]));
    expect(roots.toArray()).toEqual(["parent", "child"]);
    expect(model.blocks.getParentId("child")).toBe("parent");

    doc.transact(() => {
      roots.delete(0, 1);
      roots.push(["parent"]);
    });
    expect(model.blocks.getParentId("child")).toBeNull();

    doc.transact(() => roots.delete(0, 1));
    expect(model.blocks.getParentId("child")).toBe("parent");
    void doc.destroy();
  });

  test("keeps the materialized tree consistent when a listener reads mid-invalidation", () => {
    const doc = new YjsDoc("nested-move-reactivity");
    const model = new DocumentModelImpl(doc);
    // Two siblings nested inside a container, matching a card indented under
    // its predecessor within a kanban lane or a table cell.
    model.blocks.insertBlock({
      id: "container",
      type: "paragraph",
      children: [
        { id: "first", type: "paragraph", content: "first" },
        { id: "second", type: "paragraph", content: "second" },
      ],
    });
    // A rendered document has every snapshot cached, so an early listener can
    // rebuild an ancestor while another descendant is awaiting invalidation.
    model.blocks.getBlocks();
    const disposers = [
      model.blocks.subscribeBlock("container", () => { model.blocks.getBlocks(); }),
      model.blocks.subscribeBlock("first", () => { model.blocks.getBlocks(); }),
    ];

    model.blocks.moveBlock("second", "first", "inside");

    const reachable = model.blocks.getBlocks().flatMap(function walk(block): string[] {
      return [block.id, ...block.children.flatMap(walk)];
    });
    expect(reachable).toContain("second");
    expect(model.blocks.getBlock("first")?.children.map(({ id }) => id)).toEqual(["second"]);
    disposers.forEach((dispose) => dispose());
    void doc.destroy();
  });

  test("keeps element collection snapshots stable across block-only updates", () => {
    const doc = new YjsDoc("element-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "block", type: "paragraph" });
    model.elements.insertElement({
      id: "card",
      type: "block",
      frame: { x: 0, y: 0, width: 100, height: 100 },
      zIndex: 0,
    });
    const elements = model.elements.getElements();
    let changes = 0;
    model.elements.subscribe(() => { changes += 1; });

    model.blocks.updateBlock("block", { content: "changed" });
    expect(model.elements.getElements()).toBe(elements);
    expect(changes).toBe(0);

    model.elements.updateElement("card", { frame: { width: 120 } });
    expect(model.elements.getElements()).not.toBe(elements);
    expect(changes).toBe(1);
    void doc.destroy();
  });

  test("keeps node and child-id snapshots stable across descendant content edits", () => {
    const doc = new YjsDoc("node-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "before" }],
    });
    const parentNode = model.blocks.getBlockNode("parent");
    const parentChildren = model.blocks.getBlockNode("parent")?.childIds;
    const childNode = model.blocks.getBlockNode("child");
    const parentTree = model.blocks.getBlock("parent");

    model.blocks.updateBlock("child", { content: "after" });

    expect(model.blocks.getBlockNode("parent")).toBe(parentNode);
    expect(model.blocks.getBlockNode("parent")?.childIds).toBe(parentChildren);
    expect(model.blocks.getBlock("parent")).not.toBe(parentTree);
    expect(model.blocks.getBlock("parent")?.children[0]?.content).toBe("after");
    expect(model.blocks.getBlockNode("child")).not.toBe(childNode);
    expect(model.blocks.getBlockNode("child")?.content).toBe("after");
    expect(model.blocks.getBlockNode("child")).toBe(model.blocks.getBlockNode("child"));
    expect(model.blocks.getBlockNode("parent")?.childIds).toBe(model.blocks.getBlockNode("parent")?.childIds);
    void doc.destroy();
  });

  test("notifies only subscribers whose snapshot includes the change", () => {
    const doc = new YjsDoc("focused-block-listeners");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    const calls = { tree: 0, node: 0 };
    const disposers = [
      model.blocks.subscribeBlock("parent", () => { calls.tree += 1; }),
      model.blocks.subscribeBlockNode("parent", () => { calls.node += 1; }),
    ];

    model.blocks.updateBlock("child", { content: "after" });
    expect(calls).toEqual({ tree: 1, node: 0 });
    model.blocks.updateBlock("parent", { content: "parent" });
    expect(calls).toEqual({ tree: 2, node: 1 });
    model.blocks.insertBlock({ id: "extra", type: "paragraph" }, "child");
    expect(calls).toEqual({ tree: 3, node: 2 });

    disposers.forEach((dispose) => dispose());
    void doc.destroy();
  });

  test("notifies focused listeners when a placed block is removed", () => {
    const doc = new YjsDoc("focused-block-removal");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
    const calls = { node: 0 };
    const disposers = [
      model.blocks.subscribeBlockNode("child", () => { calls.node += 1; }),
    ];

    model.blocks.removeBlock("child");
    expect(model.blocks.getBlockNode("child")).toBeUndefined();
    expect(calls.node).toBeGreaterThan(0);

    disposers.forEach((dispose) => dispose());
    void doc.destroy();
  });

  test("replaces node and child-ID snapshots when a child list changes", () => {
    const doc = new YjsDoc("child-id-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    const parentNode = model.blocks.getBlockNode("parent");
    const parentChildren = model.blocks.getBlockNode("parent")?.childIds;
    expect(parentNode?.childIds).toEqual(["child"]);
    const emptyLeaf = model.blocks.getBlockNode("child")?.childIds;

    model.blocks.insertBlock({ id: "extra", type: "paragraph" }, "child");

    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["child", "extra"]);
    expect(model.blocks.getBlockNode("parent")?.childIds).not.toBe(parentChildren);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["child", "extra"]);
    expect(model.blocks.getBlockNode("parent")?.childIds).toBe(model.blocks.getBlockNode("parent")?.childIds);
    expect(emptyLeaf).toEqual([]);
    expect(model.blocks.getBlockNode("child")?.childIds).toBe(emptyLeaf);
    expect(model.blocks.getBlockNode("extra")?.childIds).toEqual([]);
    expect(model.blocks.getBlockNode("extra")?.childIds).not.toBe(emptyLeaf);
    expect(() => (emptyLeaf! as string[]).push("poison")).toThrow();
    expect(model.blocks.getBlockNode("child")?.childIds).toEqual([]);
    expect(model.blocks.getBlockNode("extra")?.childIds).toEqual([]);
    expect(model.blocks.getBlockNode("missing")).toBeUndefined();
    void doc.destroy();
  });

  test("replaces node fields but keeps child IDs on type and text changes", () => {
    const doc = new YjsDoc("own-block-invalidation");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "block", type: "paragraph", content: "before" });
    const node = model.blocks.getBlockNode("block");
    const children = model.blocks.getBlockNode("block")?.childIds;

    model.blocks.setBlockType("block", "heading");
    expect(model.blocks.getBlockNode("block")).not.toBe(node);
    expect(model.blocks.getBlockNode("block")?.type).toBe("heading");
    expect(model.blocks.getBlockNode("block")?.childIds).toBe(children);
    const afterType = model.blocks.getBlockNode("block");
    model.blocks.setBlockText("block", "after");
    expect(model.blocks.getBlockNode("block")).not.toBe(afterType);
    expect(model.blocks.getBlockNode("block")?.content).toBe("after");
    expect(model.blocks.getBlockNode("block")?.childIds).toBe(children);
    void doc.destroy();
  });

  test("invalidates both focused snapshots when fields and children change together", () => {
    const doc = new YjsDoc("mixed-block-changes");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "first", type: "paragraph" }],
    });
    const node = model.blocks.getBlockNode("parent");
    const children = model.blocks.getBlockNode("parent")?.childIds;
    const roots = model.blocks.getRootIds();
    let blockChanges = 0;
    let structureChanges = 0;
    model.blocks.subscribeBlock("parent", () => { blockChanges += 1; });
    model.blocks.subscribeStructure(() => { structureChanges += 1; });

    doc.transact(() => {
      model.blocks.setBlockType("parent", "heading");
      model.blocks.insertBlock({ id: "second", type: "paragraph" }, "first");
    });

    expect(model.blocks.getBlockNode("parent")).not.toBe(node);
    expect(model.blocks.getBlockNode("parent")?.type).toBe("heading");
    expect(model.blocks.getBlockNode("parent")?.childIds).not.toBe(children);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["first", "second"]);
    expect(model.blocks.getBlock("parent")?.children.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(model.blocks.getRootIds()).toBe(roots);
    expect({ blockChanges, structureChanges }).toEqual({ blockChanges: 1, structureChanges: 1 });
    void doc.destroy();
  });

  test("classifies a direct child-array replacement with other map keys", () => {
    const doc = new YjsDoc("replaced-child-array");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    const node = model.blocks.getBlockNode("parent");
    const children = model.blocks.getBlockNode("parent")?.childIds;
    const stored = doc.doc.getMap("rivto.editor.blocks").get("parent") as Y.Map<unknown>;
    const replacement = new Y.Array<string>();
    replacement.insert(0, ["child"]);

    doc.transact(() => {
      stored.set("type", "heading");
      stored.set("children", replacement);
    });

    expect(model.blocks.getBlockNode("parent")).not.toBe(node);
    expect(model.blocks.getBlockNode("parent")?.type).toBe("heading");
    expect(model.blocks.getBlockNode("parent")?.childIds).not.toBe(children);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["child"]);
    void doc.destroy();
  });

  test("nested property edits replace nodes without replacing child IDs", () => {
    const doc = new YjsDoc("nested-field-changes");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "block", type: "paragraph" });
    const children = model.blocks.getBlockNode("block")?.childIds;
    let node = model.blocks.getBlockNode("block");
    let structureChanges = 0;
    model.blocks.subscribeStructure(() => { structureChanges += 1; });

    model.blocks.setBlockProp("block", "color", "red");
    expect(model.blocks.getBlockNode("block")).not.toBe(node);
    expect(model.blocks.getBlockNode("block")?.props.color).toBe("red");
    expect(model.blocks.getBlockNode("block")?.childIds).toBe(children);
    node = model.blocks.getBlockNode("block");

    model.blocks.setPluginData("block", "notes", { labels: ["review"] });
    expect(model.blocks.getBlockNode("block")).not.toBe(node);
    expect(model.blocks.getBlockNode("block")?.pluginData.notes).toEqual({ labels: ["review"] });
    expect(model.blocks.getBlockNode("block")?.childIds).toBe(children);
    node = model.blocks.getBlockNode("block");

    model.blocks.updateBlock("block", { listProps: { collapsed: true } });
    expect(model.blocks.getBlockNode("block")).not.toBe(node);
    expect(model.blocks.getBlockNode("block")?.listProps.collapsed).toBe(true);
    expect(model.blocks.getBlockNode("block")?.childIds).toBe(children);
    expect(structureChanges).toBe(0);
    void doc.destroy();
  });

  test("moves between roots and children without changing unrelated node fields", () => {
    const doc = new YjsDoc("root-child-transfer");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "parent", type: "paragraph" });
    model.blocks.insertBlock({ id: "moving", type: "paragraph" }, "parent");
    const parentNode = model.blocks.getBlockNode("parent");
    const movingNode = model.blocks.getBlockNode("moving");
    const emptyChildren = model.blocks.getBlockNode("parent")?.childIds;
    const roots = model.blocks.getRootIds();

    model.blocks.moveBlock("moving", "parent", "inside");
    expect(model.blocks.getBlockNode("parent")).not.toBe(parentNode);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["moving"]);
    expect(model.blocks.getBlockNode("moving")).toBe(movingNode);
    expect(model.blocks.getBlockNode("parent")?.childIds).not.toBe(emptyChildren);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual(["moving"]);
    expect(model.blocks.getRootIds()).not.toBe(roots);
    expect(model.blocks.getRootIds()).toEqual(["parent"]);
    expect(model.blocks.getBlock("parent")?.children.map(({ id }) => id)).toEqual(["moving"]);

    model.blocks.moveBlock("moving", "parent", "after");
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual([]);
    expect(model.blocks.getBlockNode("moving")).toBe(movingNode);
    expect(model.blocks.getBlockNode("parent")?.childIds).toEqual([]);
    expect(model.blocks.getRootIds()).toEqual(["parent", "moving"]);
    void doc.destroy();
  });

  test("updates parent links without reading unrelated block records", () => {
    const doc = new YjsDoc("local-parent-refresh");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "source", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
    model.blocks.insertBlock({ id: "target", type: "paragraph" });
    model.blocks.insertBlock({ id: "unrelated", type: "paragraph" });
    const stored = doc.doc.getMap("rivto.editor.blocks");
    const source = (stored.get("source") as Y.Map<unknown>).get("children") as Y.Array<string>;
    const target = (stored.get("target") as Y.Map<unknown>).get("children") as Y.Array<string>;
    const manager = model.blocks as unknown as { storage: { get(id: string): unknown } };
    const get = jest.spyOn(manager.storage, "get");

    doc.transact(() => {
      source.delete(0, 1);
      target.push(["child"]);
    });

    expect(model.blocks.getParentId("child")).toBe("target");
    expect(get).not.toHaveBeenCalledWith("unrelated");
    get.mockRestore();
    void doc.destroy();
  });

  test("indexes a new root subtree without visiting existing branches", () => {
    const doc = new YjsDoc("local-root-refresh");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "unrelated", type: "paragraph" });
    const manager = model.blocks as unknown as { storage: { get(id: string): unknown } };
    const get = jest.spyOn(manager.storage, "get");

    model.blocks.insertBlock({
      id: "new-root",
      type: "paragraph",
      children: [{ id: "new-child", type: "paragraph" }],
    });

    expect(model.blocks.getParentId("new-root")).toBeNull();
    expect(model.blocks.getParentId("new-child")).toBe("new-root");
    expect(get).not.toHaveBeenCalledWith("unrelated");
    get.mockRestore();
    void doc.destroy();
  });

  test("does not reuse snapshots after deleting and recreating a block ID", () => {
    const doc = new YjsDoc("block-id-reuse");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "reused", type: "paragraph", content: "old" });
    const node = model.blocks.getBlockNode("reused");
    const children = model.blocks.getBlockNode("reused")?.childIds;

    model.blocks.removeBlock("reused");
    expect(model.blocks.getBlockNode("reused")).toBeUndefined();
    model.blocks.insertBlock({
      id: "reused",
      type: "heading",
      content: "new",
      children: [{ id: "new-child", type: "paragraph" }],
    });

    expect(model.blocks.getBlockNode("reused")).not.toBe(node);
    expect(model.blocks.getBlockNode("reused")?.content).toBe("new");
    expect(model.blocks.getBlockNode("reused")?.childIds).not.toBe(children);
    expect(model.blocks.getBlockNode("reused")?.childIds).toEqual(["new-child"]);
    expect(model.blocks.getBlock("reused")?.children.map(({ id }) => id)).toEqual(["new-child"]);
    void doc.destroy();
  });

  test("reads live fields during a transaction without caching partial values", () => {
    const doc = new YjsDoc("in-flight-block-reads");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "block", type: "paragraph", content: "before" });
    const before = model.blocks.getBlockNode("block");

    doc.transact(() => {
      model.blocks.setBlockText("block", "middle");
      expect(model.blocks.getBlockNode("block")?.content).toBe("middle");
      model.blocks.setBlockText("block", "after");
      expect(model.blocks.getBlockNode("block")?.content).toBe("after");
    });

    expect(model.blocks.getBlockNode("block")).not.toBe(before);
    expect(model.blocks.getBlockNode("block")?.content).toBe("after");
    expect(model.blocks.getBlockNode("block")).toBe(model.blocks.getBlockNode("block"));
    void doc.destroy();
  });

  test("does not let callers mutate cached node fields or nested properties", () => {
    const doc = new YjsDoc("node-snapshot-immutability");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "block",
      type: "paragraph",
      props: { nested: { values: ["stored"] } },
    });
    const node = model.blocks.getBlockNode("block")!;
    const nested = node.props.nested as { values: string[] };

    expect(() => { node.type = "heading"; }).toThrow();
    expect(() => nested.values.push("poison")).toThrow();
    expect(model.blocks.getBlockNode("block")?.type).toBe("paragraph");
    expect(model.blocks.getBlockNode("block")?.props.nested).toEqual({ values: ["stored"] });
    const updated = model.blocks.updateBlock("block", { props: { nested: { values: ["updated"] } } });
    (updated.props.nested as { values: string[] }).values.push("local-only");
    expect(model.blocks.getBlockNode("block")?.props.nested).toEqual({ values: ["updated"] });
    void doc.destroy();
  });

  test("does not let callers mutate cached roots or recursive blocks", () => {
    const doc = new YjsDoc("tree-snapshot-immutability");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    const roots = model.blocks.getRootIds();
    const tree = model.blocks.getBlock("parent")!;

    expect(() => roots.push("poison")).toThrow();
    expect(() => tree.children.push(tree)).toThrow();
    expect(() => { tree.type = "heading"; }).toThrow();
    expect(model.blocks.getRootIds()).toEqual(["parent"]);
    expect(model.blocks.getBlock("parent")?.children.map(({ id }) => id)).toEqual(["child"]);
    void doc.destroy();
  });

  test("publishes focused snapshots for remote block updates", () => {
    const leftDoc = new YjsDoc("remote-left");
    const left = new DocumentModelImpl(leftDoc);
    left.blocks.insertBlock({ id: "remote", type: "paragraph", content: "before" });
    const rightDoc = new YjsDoc("remote-right");
    Y.applyUpdate(rightDoc.doc, Y.encodeStateAsUpdate(leftDoc.doc));
    const right = new DocumentModelImpl(rightDoc);
    const before = right.blocks.getBlock("remote");
    let calls = 0;
    right.blocks.subscribeBlock("remote", () => { calls += 1; });

    left.blocks.updateBlock("remote", { content: "after" });
    Y.applyUpdate(
      rightDoc.doc,
      Y.encodeStateAsUpdate(leftDoc.doc, Y.encodeStateVector(rightDoc.doc)),
    );

    expect(calls).toBe(1);
    expect(right.blocks.getBlock("remote")).not.toBe(before);
    expect(right.blocks.getBlock("remote")?.content).toBe("after");
    expect(right.blocks.getBlockNode("remote")?.content).toBe("after");
    void leftDoc.destroy();
    void rightDoc.destroy();
  });

  test("updates node child IDs after a remote insertion", () => {
    const leftDoc = new YjsDoc("remote-child-left");
    const left = new DocumentModelImpl(leftDoc);
    left.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "first", type: "paragraph" }],
    });
    const rightDoc = new YjsDoc("remote-child-right");
    Y.applyUpdate(rightDoc.doc, Y.encodeStateAsUpdate(leftDoc.doc));
    const right = new DocumentModelImpl(rightDoc);
    const node = right.blocks.getBlockNode("parent");
    const children = right.blocks.getBlockNode("parent")?.childIds;

    left.blocks.insertBlock({ id: "second", type: "paragraph" }, "first");
    Y.applyUpdate(
      rightDoc.doc,
      Y.encodeStateAsUpdate(leftDoc.doc, Y.encodeStateVector(rightDoc.doc)),
    );

    expect(right.blocks.getBlockNode("parent")).not.toBe(node);
    expect(right.blocks.getBlockNode("parent")?.childIds).toEqual(["first", "second"]);
    expect(right.blocks.getBlockNode("parent")?.childIds).not.toBe(children);
    expect(right.blocks.getBlockNode("parent")?.childIds).toEqual(["first", "second"]);
    void leftDoc.destroy();
    void rightDoc.destroy();
  });
});
