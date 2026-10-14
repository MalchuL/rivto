import { createTestEditor as createDocumentEditor } from "../test-utils";

describe("DocumentEditor element commands", () => {
  const input = {
    childIds: [],
    id: "shape",
    type: "rectangle",
    frame: { x: 10, y: 20, width: 100, height: 80 },
    zIndex: 2,
    props: { fill: "red", nested: { retained: true } },
  } as const;

  it("creates, patches, snapshots, and removes generic elements", async () => {
    const editor = await createDocumentEditor();
    const { childIds: _childIds, ...fields } = input;
    expect(editor.elements.insertElement(input)).toEqual({ ...fields, children: [] });
    const updated = editor.elements.updateElement("shape", {
      frame: { x: 30 },
      props: { stroke: "blue" },
    });
    expect(updated).toEqual({
      ...input,
      frame: { ...input.frame, x: 30 },
      props: { ...input.props, stroke: "blue" },
    });
    expect(editor.elements.getElementNode("shape")).toEqual({
      ...input,
      frame: { ...input.frame, x: 30 },
      props: { ...input.props, stroke: "blue" },
    });
    expect(editor.dump()).toMatchObject({
      version: 9,
      elements: [{ id: "shape", type: "rectangle" }],
    });
    editor.elements.removeElement("shape");
    expect(editor.elements.getElementNodes()).toEqual([]);
    editor.destroy();
  });

  it("prevalidates atomic updates and tracks element undo and redo", async () => {
    const editor = await createDocumentEditor();
    editor.elements.insertElement(input);
    editor.history.clear();
    expect(() =>
      editor.elements.updateElements([
        { id: "shape", patch: { frame: { x: 40 } } },
        { id: "missing", patch: { zIndex: 4 } },
      ]),
    ).toThrow("Element missing not found");
    expect(editor.elements.getElementNode("shape")?.frame.x).toBe(10);

    editor.elements.updateElement("shape", { frame: { x: 40 } });
    editor.history.undo();
    expect(editor.elements.getElementNode("shape")?.frame.x).toBe(10);
    editor.history.redo();
    expect(editor.elements.getElementNode("shape")?.frame.x).toBe(40);
    editor.destroy();
  });

  it("rejects invalid geometry and unsupported snapshot versions", async () => {
    const editor = await createDocumentEditor();
    expect(() =>
      editor.elements.insertElement({ ...input, frame: { ...input.frame, width: 0 } }),
    ).toThrow();
    editor.elements.insertElement(input);
    expect(() => editor.load({ version: 4, blocks: [] } as never)).toThrow(
      "Unsupported Rivto document snapshot version: 4",
    );
    expect(editor.elements.getElementNode("shape")).toBeDefined();
    editor.destroy();
  });

  it("runs registered element processors before insert and update", async () => {
    const editor = await createDocumentEditor();
    const dispose = editor.elements.registerProcessor({
      id: "test.element.tag",
      priority: 30,
      processor: (element) => ({
        ...element,
        props: { ...element.props, tagged: true },
      }),
    });
    editor.elements.insertElement({ ...input, id: "processed" });
    expect(editor.elements.getElementNode("processed")?.props).toMatchObject({
      fill: "red",
      tagged: true,
    });
    editor.elements.updateElement("processed", { props: { stroke: "blue" } });
    expect(editor.elements.getElementNode("processed")?.props).toMatchObject({
      stroke: "blue",
      tagged: true,
    });
    dispose();
    editor.destroy();
  });

  it("removes child references without changing blocks or opaque properties", async () => {
    const editor = await createDocumentEditor();
    editor.blocks.insertBlock({ id: "from", type: "paragraph" });
    editor.blocks.insertBlock({ id: "to", type: "paragraph" });
    editor.elements.insertElement(input);
    editor.elements.insertElement({
      childIds: ["shape"],
      id: "opaque-group",
      type: "group",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: { reference: "shape" },
    });

    editor.elements.removeElement("shape");

    expect(editor.blocks.getRootIds()).toEqual(["from", "to"]);
    expect(editor.elements.getElementNode("opaque-group")?.childIds).toEqual([]);
    expect(editor.elements.getElementNode("opaque-group")?.props).toEqual({ reference: "shape" });
    editor.destroy();
  });
});

it("processes new descendants and processor-added children before one atomic insertion", async () => {
  const editor = await createDocumentEditor();
  const frame = { x: 10, y: 20, width: 30, height: 40 };
  editor.elements.registerProcessor({
    id: "tree-input",
    priority: 0,
    processor: (input) => ({
      ...input,
      props: { ...input.props, processed: true },
      children:
        input.id === "root" ? [{ id: "added", type: "shape", frame, zIndex: 0 }] : input.children,
    }),
  });
  const root = editor.elements.insertElement({ type: "group", id: "root", zIndex: 0 });
  expect(root.frame).toEqual(frame);
  expect(root.children[0]!.props.processed).toBe(true);
  expect(editor.elements.getElementNode("root")!.childIds).toEqual(["added"]);
  editor.history.undo();
  expect(editor.elements.getElementNodes()).toEqual([]);
  await editor.destroy();
});
