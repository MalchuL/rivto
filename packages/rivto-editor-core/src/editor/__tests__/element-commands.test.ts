import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("EditorRuntime element commands", () => {
  const input = {
    id: "shape",
    type: "rectangle",
    frame: { x: 10, y: 20, width: 100, height: 80 },
    zIndex: 2,
    props: { fill: "red", nested: { retained: true } },
  } as const;

  it("creates, patches, snapshots, and removes generic elements", () => {
    const editor = createRivtoEditor();
    expect(editor.elements.insertElement(input)).toBe("shape");
    editor.elements.updateElement("shape", { frame: { x: 30 }, props: { stroke: "blue" } });
    expect(editor.elements.getElement("shape")).toEqual({
      ...input,
      frame: { ...input.frame, x: 30 },
      props: { ...input.props, stroke: "blue" },
    });
    expect(editor.dump()).toMatchObject({ version: 6, elements: [{ id: "shape", type: "rectangle" }] });
    editor.elements.removeElement("shape");
    expect(editor.elements.getElements()).toEqual([]);
    editor.destroy();
  });

  it("prevalidates atomic updates and tracks element undo and redo", () => {
    const editor = createRivtoEditor();
    editor.elements.insertElement(input);
    editor.history.clear();
    expect(() => editor.elements.updateElements([
      { id: "shape", patch: { frame: { x: 40 } } },
      { id: "missing", patch: { zIndex: 4 } },
    ])).toThrow("Element missing not found");
    expect(editor.elements.getElement("shape")?.frame.x).toBe(10);

    editor.elements.updateElement("shape", { frame: { x: 40 } });
    editor.undo();
    expect(editor.elements.getElement("shape")?.frame.x).toBe(10);
    editor.redo();
    expect(editor.elements.getElement("shape")?.frame.x).toBe(40);
    editor.destroy();
  });

  it("rejects invalid geometry and unsupported snapshot versions", () => {
    const editor = createRivtoEditor();
    expect(() => editor.elements.insertElement({ ...input, frame: { ...input.frame, width: 0 } })).toThrow();
    editor.elements.insertElement(input);
    expect(() => editor.load({ version: 4, blocks: [] } as never)).toThrow(
      "Unsupported Rivto document snapshot version: 4",
    );
    expect(editor.elements.getElement("shape")).toBeDefined();
    editor.destroy();
  });

  it("runs registered element processors before insert and update", () => {
    const editor = createRivtoEditor();
    const dispose = editor.document.elements.pipe.register({
      id: "test.element.tag",
      priority: 30,
      processor: (element) => ({
        ...element,
        props: { ...element.props, tagged: true },
      }),
    });
    editor.elements.insertElement({ ...input, id: "processed" });
    expect(editor.elements.getElement("processed")?.props).toMatchObject({ fill: "red", tagged: true });
    editor.elements.updateElement("processed", { props: { stroke: "blue" } });
    expect(editor.elements.getElement("processed")?.props).toMatchObject({ stroke: "blue", tagged: true });
    dispose();
    editor.destroy();
  });

  it("does not cascade core element deletion into blocks or opaque references", () => {
    const editor = createRivtoEditor();
    editor.blocks.insertBlock({ id: "from", type: "paragraph" });
    editor.blocks.insertBlock({ id: "to", type: "paragraph" });
    editor.elements.insertElement(input);
    editor.elements.insertElement({
      id: "opaque-group",
      type: "group",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: { children: ["shape"] },
    });

    editor.elements.removeElement("shape");

    expect(editor.blocks.getRootIds()).toEqual(["from", "to"]);
    expect(editor.elements.getElement("opaque-group")?.props).toEqual({ children: ["shape"] });
    editor.destroy();
  });
});
